import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildContentSecurityPolicy } from '@/shared/http/content-security-policy';
import { isSafeMutationRequest } from '@/shared/http/request-security';

export function proxy(request: NextRequest) {
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
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');

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
