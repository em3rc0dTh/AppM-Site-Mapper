import { NextResponse } from 'next/server';

import { getCurrentSessionUser } from '@/modules/identity/application/current-session';

export async function GET() {
  const user = await getCurrentSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
