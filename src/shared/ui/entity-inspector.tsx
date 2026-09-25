'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { StatusBadge } from './primitives';

export interface InspectorEntity {
  name: string;
  kind: string;
  status?: string;
  sections: readonly {
    title: string;
    fields?: readonly { label: string; value: string | number }[];
    content?: ReactNode;
  }[];
  actions?: readonly { label: string; href: string }[];
}

function toneForStatus(status: string | undefined) {
  if (!status) return 'neutral' as const;

  const normalized = status.toUpperCase();

  if (['ACTIVE', 'LIVE', 'CONNECTED', 'AVAILABLE', 'HEALTHY'].includes(normalized)) {
    return 'good' as const;
  }

  if (['RESERVED', 'RECONNECTING', 'ARCHIVED', 'DEGRADED', 'WARNING'].includes(normalized)) {
    return 'warning' as const;
  }

  if (['CRITICAL', 'ERROR', 'FAILED', 'OFFLINE', 'DISCONNECTED'].includes(normalized)) {
    return 'danger' as const;
  }

  if (['EQUIPPED', 'DEVICE', 'EQUIPMENT'].includes(normalized)) {
    return 'accent' as const;
  }

  return 'neutral' as const;
}

export function EntityInspector({
  entity,
  onClose,
}: {
  entity: InspectorEntity | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState(0);

  const isOpen = entity !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!isOpen || !dialog) return;

    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();

    return () => {
      dialog.close();
      previous?.focus();
    };
  }, [isOpen]);

  if (!entity) return null;

  const activeTab = Math.min(tab, Math.max(entity.sections.length - 1, 0));
  const section = entity.sections[activeTab];

  return (
    <dialog
      ref={ref}
      className="inspector-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;

        if (outside) onClose();
      }}
    >
      <header className="inspector-header">
        <div>
          <p className="eyebrow">{entity.kind.replaceAll('_', ' ')}</p>
          <h2 id={titleId}>{entity.name}</h2>
          {entity.status && (
            <StatusBadge tone={toneForStatus(entity.status)}>{entity.status}</StatusBadge>
          )}
        </div>
        <button
          type="button"
          className="button-quiet inspector-close"
          aria-label="Close inspector"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      {entity.sections.length > 1 && (
        <div className="inspector-tabs" role="tablist" aria-label="Entity details">
          {entity.sections.map((item, index) => (
            <button
              type="button"
              id={`${titleId}-tab-${index}`}
              role="tab"
              aria-selected={index === activeTab}
              aria-controls={`${titleId}-panel`}
              tabIndex={index === activeTab ? 0 : -1}
              key={item.title}
              onClick={() => setTab(index)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % entity.sections.length
                    : event.key === 'ArrowLeft'
                      ? (index - 1 + entity.sections.length) % entity.sections.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? entity.sections.length - 1
                          : null;

                if (next !== null) {
                  event.preventDefault();
                  setTab(next);
                  document.getElementById(`${titleId}-tab-${next}`)?.focus();
                }
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}

      <div className="inspector-body">
        {section ? (
          <section
            id={`${titleId}-panel`}
            role={entity.sections.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={entity.sections.length > 1 ? `${titleId}-tab-${activeTab}` : undefined}
            tabIndex={0}
            className="inspector-section"
          >
            <h2>{section.title}</h2>
            {section.content}
            {section.fields && (
              <dl className="inspector-facts">
                {section.fields.map((field) => (
                  <div key={`${section.title}-${field.label}`}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ) : null}

        <div className="inspector-actions">
          {entity.actions?.map((action) => (
            <Link
              className="action-link"
              key={`${action.href}-${action.label}`}
              href={action.href}
              onClick={onClose}
            >
              {action.label} →
            </Link>
          ))}
        </div>
      </div>
    </dialog>
  );
}

export function InspectButton({
  entity,
  label = 'Inspect',
}: {
  entity: InspectorEntity;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="button-quiet"
        type="button"
        aria-label={`${label} ${entity.name}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && <EntityInspector entity={entity} onClose={() => setOpen(false)} />}
    </>
  );
}
