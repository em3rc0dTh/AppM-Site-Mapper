import type { NextResponse } from 'next/server';

import { parseAppEnvironment } from '@/config/env';

export const AUTH_COOKIE_NAME = 'appm_session';

function secureCookie(): boolean {
  return parseAppEnvironment(process.env.APP_ENV) === 'production';
}

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
