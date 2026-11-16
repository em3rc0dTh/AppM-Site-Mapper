import { isProductionDeployment } from '@/config/env';
import type { NextResponse } from 'next/server';

// __Host- enforces Secure, Path=/ and no Domain in production browsers.
export const AUTH_COOKIE_NAME = isProductionDeployment() ? '__Host-appm_session' : 'appm_session';

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProductionDeployment(),
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
    secure: isProductionDeployment(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
