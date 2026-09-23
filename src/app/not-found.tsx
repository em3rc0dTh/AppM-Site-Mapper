import Link from 'next/link';
import { StatePanel } from '@/shared/ui/primitives';
export default function NotFound() {
  return (
    <StatePanel
      title="Entity not found"
      description="This address does not resolve to an available entity."
      action={
        <Link className="action-link" href="/network">
          Open Network
        </Link>
      }
    />
  );
}
