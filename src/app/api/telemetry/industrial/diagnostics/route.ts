import { requirePermission } from '@/modules/identity/application/current-session';
import { captureDiagnostics } from '@/modules/telemetry/infrastructure/industrial/diagnostics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  try {
    return Response.json(await captureDiagnostics(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'INDUSTRIAL_DIAGNOSTICS_UNAVAILABLE' }, { status: 503 });
  }
}
