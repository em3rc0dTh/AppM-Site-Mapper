import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/messages/en.json';

/** Render the real translated UI with the same provider boundary as the app. */
export function renderWithIntl(children: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  );
}
