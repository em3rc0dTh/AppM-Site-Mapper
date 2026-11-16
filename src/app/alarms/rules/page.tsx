import { redirect } from 'next/navigation';

import { RuleManager } from '@/components/alarm/rule-manager';
import { requirePermission } from '@/modules/identity/application/current-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AlarmRuleManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ breakerId?: string }>;
}) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');
  const editing = await requirePermission('settings:write');
  const candidate = (await searchParams).breakerId;
  const initialBreakerId =
    typeof candidate === 'string' && candidate.length <= 128 ? candidate : '';
  return (
    <main className="sm-rule-page">
      <RuleManager canEdit={editing.ok} initialBreakerId={initialBreakerId} />
    </main>
  );
}
