import type { ReactNode } from 'react';

import './workbench.css';
import './power-trace.css';

export default function WorkbenchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
