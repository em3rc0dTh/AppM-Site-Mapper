import type { ReactNode } from 'react';

import './workbench.css';

export default function WorkbenchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
