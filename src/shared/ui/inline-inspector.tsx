import Link from 'next/link';
import type { InspectorEntity } from './entity-inspector';
export function InlineInspector({
  entity,
  onClose,
}: {
  entity: InspectorEntity;
  onClose: () => void;
}) {
  return (
    <aside
      className="mk-inline-inspector mk-selection-inspector"
      aria-label="Selected object inspector"
    >
      <header>
        <small>{entity.kind}</small>
        <button onClick={onClose} aria-label="Clear selection">
          ×
        </button>
      </header>
      <h2>{entity.name}</h2>
      {entity.sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <dl>
            {section.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {entity.actions?.map((action) => (
        <Link key={action.href} className="mk-primary" href={action.href}>
          {action.label}
        </Link>
      ))}
    </aside>
  );
}
