import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'appm-site-mapper',
    milestone: 'MK1-F0',
    gate: 'G0',
  });
}
