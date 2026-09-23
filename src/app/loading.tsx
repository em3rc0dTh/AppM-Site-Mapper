import { StatePanel } from '@/shared/ui/primitives';
export default function Loading() {
  return (
    <StatePanel
      kind="loading"
      title="Loading workspace"
      description="Retrieving the latest operational view."
    />
  );
}
