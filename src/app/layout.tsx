import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import './legacy-fidelity.css';
import './physical-flow.css';
import { AppShell } from '@/shared/ui/app-shell';

export const metadata: Metadata = {
  title: 'AppM Site Mapper MK1',
  description: 'Physical infrastructure mapping and operations platform.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
