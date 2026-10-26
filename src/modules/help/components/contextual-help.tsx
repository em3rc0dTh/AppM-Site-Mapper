'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { getHelpEntry, helpSummary, helpTitle, recommendHelp, type HelpLocale } from '../catalog';

export function ContextualHelp() {
  const pathname = usePathname();
  const locale: HelpLocale = useLocale() === 'es' ? 'es' : 'en';
  const t = useTranslations('help');
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const suggestions = recommendHelp(pathname)
    .map(getHelpEntry)
    .filter((item) => item != null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    /* Changing the screen must also remove the previous context. */ setOpen(false);
  }, [pathname]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        className="help-trigger"
        ref={trigger}
        aria-haspopup="dialog"
        aria-label={t('openContext')}
        title={t('openContext')}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">?</span>
        <span className="help-trigger-label">{t('help')}</span>
      </button>
      <dialog
        ref={dialog}
        className="help-context-dialog"
        aria-label={t('contextHeading')}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <header className="help-context-header">
          <div>
            <span className="help-eyebrow">{t('contextTag')}</span>
            <h2>{t('contextHeading')}</h2>
          </div>
          <button type="button" className="help-close" onClick={close} aria-label={t('close')}>
            ×
          </button>
        </header>
        <p>{t('contextDescription')}</p>
        <div className="help-context-links">
          {suggestions.map((item) => (
            <Link key={item.slug} href={'/help/' + item.slug} onClick={() => setOpen(false)}>
              <strong>{helpTitle(item, locale)}</strong>
              <span>{helpSummary(item, locale)}</span>
            </Link>
          ))}
        </div>
        <Link className="help-context-all" href="/help" onClick={() => setOpen(false)}>
          {t('seeAll')} <span aria-hidden="true">→</span>
        </Link>
      </dialog>
    </>
  );
}
