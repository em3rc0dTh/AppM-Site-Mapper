import type { NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'appm_session';

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.APP_ENV === 'production',
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
    secure: process.env.APP_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
