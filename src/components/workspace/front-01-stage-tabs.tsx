'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

type Front01View = 'physical' | 'operation';

interface Front01ViewDefinition {
  readonly key: Front01View;
  readonly title: string;
}

interface Props {
  readonly physical: ReactNode;
  readonly operation: ReactNode;
  readonly maintenance?: ReactNode;
  readonly label: string;
  readonly heading?: string;
  readonly physicalHeading?: string;
  readonly operationHeading?: string;
  readonly headingStatus?: ReactNode;
}

/** FRONT-01 is a presentation split; all original editors and service contracts are reused. */
export function Front01StageTabs({
  physical,
  operation,
  label,
  heading,
  physicalHeading,
  operationHeading,
  headingStatus,
}: Props) {
  const t = useTranslations('front01Ui');
  const [view, setView] = useState<Front01View>('physical');
  const views: readonly Front01ViewDefinition[] = [
    { key: 'physical', title: t('physicalView') },
    { key: 'operation', title: t('operation') },
  ];

  const activeHeading =
    view === 'physical' ? (physicalHeading ?? heading) : (operationHeading ?? heading);

  return (
    <div className="front01-stage">
      {activeHeading ? (
        <div className="front01-stage-heading-row">
          <h1 className="front01-stage-heading">{activeHeading}</h1>
          {headingStatus}
        </div>
      ) : null}
      <div className="front01-primary-tabs" role="tablist" aria-label={label}>
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`front01-tab-${item.key}`}
            aria-selected={view === item.key}
            aria-controls={`front01-panel-${item.key}`}
            onClick={() => setView(item.key)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div id="front01-panel-physical" role="tabpanel" aria-labelledby="front01-tab-physical" hidden={view !== 'physical'}>
        {physical}
      </div>
      {view === 'operation' && (
        <div id="front01-panel-operation" className="front01-operational-content" role="tabpanel" aria-labelledby="front01-tab-operation">
          {operation}
        </div>
      )}
    </div>
  );
}
