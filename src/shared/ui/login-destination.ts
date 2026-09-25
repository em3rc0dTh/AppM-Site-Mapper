/** Restrict post-login navigation to known same-origin application routes. */
export function loginDestination(value: string | null): string {
  if (!value || /[\\\r\n]/.test(value)) return '/workspace';
  if (!/^\/(?:topology|rack|blueprint|network|workspace)(?:\/|$)/.test(value)) return '/workspace';
  try {
    const url = new URL(value, 'https://app.invalid');
    return url.origin === 'https://app.invalid' ? `${url.pathname}${url.search}` : '/workspace';
  } catch {
    return '/workspace';
  }
}
