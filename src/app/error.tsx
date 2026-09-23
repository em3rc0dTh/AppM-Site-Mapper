'use client';
import { StatePanel } from '@/shared/ui/primitives';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <StatePanel
      kind="error"
      title="This view could not be loaded"
      description="Try again. If the issue continues, contact your administrator."
      action={
        <button type="button" onClick={reset}>
          Try again
        </button>
      }
    />
  );
}
