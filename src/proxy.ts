import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildContentSecurityPolicy } from '@/shared/http/content-security-policy';
import { isSafeMutationRequest } from '@/shared/http/request-security';

export function proxy(request: NextRequest) {
  const visualDevUpstream = process.env.SITE_MAPPER_VISUAL_DEV_UPSTREAM?.trim();
  const visualDevReadOnly = process.env.SITE_MAPPER_VISUAL_DEV_READ_ONLY === 'true';

  // Visual-dev never owns industrial ingestion. Read-only telemetry requests are
  // delegated to the already-running seed-01 Site Mapper runtime so :3002 can
  // render the same LIVE/STALE/OFFLINE data without opening a second MQTT/SNMP
  // consumer or Modbus projection path.
  if (
    visualDevUpstream &&
    request.method === 'GET' &&
    request.nextUrl.pathname.startsWith('/api/telemetry/')
  ) {
    const upstream = new URL(request.nextUrl.pathname + request.nextUrl.search, visualDevUpstream);
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.delete('host');
    upstreamHeaders.delete('connection');
    upstreamHeaders.delete('content-length');
    return NextResponse.rewrite(upstream, {
      request: {
        headers: upstreamHeaders,
      },
    });
  }

  // Read-only visual development blocks operational mutations. Login/logout are
  // intentionally allowed because they only establish/remove the browser session.
  if (
    visualDevReadOnly &&
    request.nextUrl.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
    !['/api/auth/login', '/api/auth/logout'].includes(request.nextUrl.pathname)
  ) {
    return NextResponse.json({ error: 'VISUAL_DEV_READ_ONLY' }, { status: 423 });
  }

  // Apply a common same-origin fence to cookie-authenticated mutations,
  // including handlers that have not yet adopted bounded JSON parsing.
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    if (!isSafeMutationRequest(request)) {
      return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
    }
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > 1_048_576) {
      return NextResponse.json({ error: 'JSON_TOO_LARGE' }, { status: 413 });
    }
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const secureTransport =
    process.env.SITE_MAPPER_HTTPS_ENABLED === 'true' ||
    forwardedProto === 'https' ||
    request.nextUrl.protocol === 'https:';
  const csp = buildContentSecurityPolicy(nonce, development, secureTransport);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
