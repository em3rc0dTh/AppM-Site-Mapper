'use client';

import type { ReactNode } from 'react';

export function DetachedWorkbenchButton({
  href,
  windowName,
  label,
  children,
}: Readonly<{
  href: string;
  windowName: string;
  label: string;
  children?: ReactNode;
}>) {
  return (
    <a
      className="sm-detached-workbench-button"
      href={href}
      target={windowName}
      aria-label={label}
      title={label}
      onClick={(event) => {
        const width = Math.min(1500, Math.max(980, window.screen.availWidth - 120));
        const height = Math.min(980, Math.max(720, window.screen.availHeight - 120));
        const left = Math.max(0, window.screenX + Math.round((window.outerWidth - width) / 2));
        const top = Math.max(0, window.screenY + 40);
        const opened = window.open(
          href,
          windowName,
          [
            'popup=yes',
            `width=${width}`,
            `height=${height}`,
            `left=${left}`,
            `top=${top}`,
            'resizable=yes',
            'scrollbars=yes',
          ].join(','),
        );
        if (opened) {
          event.preventDefault();
          opened.focus();
        }
      }}
    >
      {children ?? label}
    </a>
  );
}
