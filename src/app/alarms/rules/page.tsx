import { redirect } from 'next/navigation';

import { RuleManager } from '@/components/alarm/rule-manager';
import { requirePermission } from '@/modules/identity/application/current-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AlarmRuleManagerPage() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');
  const editing = await requirePermission('settings:write');
  return (
    <main className="sm-rule-page">
      <RuleManager canEdit={editing.ok} />
    </main>
  );
}
