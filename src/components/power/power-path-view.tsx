'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge, Surface } from '@/shared/ui/primitives';

export interface PowerStage {
  href?: string;
  id: string;
  kind: string;
  name: string;
}
export function PowerPathView({
  label,
  feed,
  stages,
}: {
  label: string;
  feed: string;
  stages: readonly PowerStage[];
}) {
  const t = useTranslations('powerPathView');
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  return (
    <Surface className="power-card">
      <header className="power-card-header">
        <h2>{label}</h2>
        <StatusBadge tone={feed === 'A' ? 'accent' : feed === 'B' ? 'warning' : 'neutral'}>
          {feed ? t('feed', { feed }) : t('unspecifiedFeed')}
        </StatusBadge>
      </header>
      <div className="power-flow" aria-label={t('pathAria', { label })}>
        {stages.map((stage, index) => (
          <div key={`${index}-${stage.id}`} className="power-stage">
            <button
              type="button"
              aria-label={t('inspect', { name: stage.name })}
              onClick={() =>
                setSelected({
                  name: stage.name,
                  kind: stage.kind,
                  actions: stage.href ? [{ label: t('openPhysical'), href: stage.href }] : [],
                  sections: [
                    {
                      title: t('overview'),
                      fields: [
                        { label: t('path'), value: label },
                        { label: t('feedLabel'), value: feed || t('notSpecified') },
                        { label: t('reference'), value: stage.id },
                      ],
                    },
                  ],
                })
              }
            >
              <small>
                {index === 0 ? `${t('source')} / ` : index === stages.length - 1 ? `${t('target')} / ` : ''}
                {stage.kind.replaceAll('_', ' ')}
              </small>
              <strong>{stage.name}</strong>
            </button>
            {index < stages.length - 1 && (
              <span className="power-step-arrow" aria-hidden="true">
                ↓
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="telemetry-unit-note">
        {t('telemetryRequired')}
      </p>
      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </Surface>
  );
}
