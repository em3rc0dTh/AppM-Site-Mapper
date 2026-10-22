import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import './globals.css';
import './legacy-fidelity.css';
import './telxius-ui.css';
import './mk1.css';
import './visual-parity.css';
import './room-light.css';
import './interaction-recovery.css';
import './spatial-editor.css';
import './home-redesign.css';
import './equipment-composition-contract.css';
import { AppShell } from '@/shared/ui/app-shell';

export const metadata: Metadata = {
  title: 'AppM Site Mapper MK1',
  description: 'Physical infrastructure mapping and operations platform.',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Nonce-based CSP requires per-request dynamic rendering. Without it,
  // Next.js may serve HTML whose inline scripts lack the request nonce.
  await headers();
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
