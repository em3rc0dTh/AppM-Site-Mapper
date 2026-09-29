import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { searchTopology } from '@/modules/workspace/application/search-service';
export async function GET(request: Request) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.length > 120) return NextResponse.json({ error: 'QUERY_TOO_LONG' }, { status: 400 });
  return NextResponse.json({ results: await searchTopology(await createTopologyRepository(), query) }, { headers: { 'Cache-Control': 'no-store' } });
}
