'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

type Side = 'tree' | 'inspector';
type Widths = { tree: number; inspector: number };
const DEFAULT: Widths = { tree: 232, inspector: 320 };
const LIMITS = { tree: 180, inspector: 240, canvas: 320 } as const;

export function constrainWorkspaceWidths(width: number, proposed: Widths): Widths {
  if (!Number.isFinite(width) || width < LIMITS.tree + LIMITS.inspector + LIMITS.canvas)
    return DEFAULT;
  const tree = Math.max(
    LIMITS.tree,
    Math.min(Math.round(proposed.tree), Math.min(420, width - LIMITS.inspector - LIMITS.canvas)),
  );
  const inspector = Math.max(
    LIMITS.inspector,
    Math.min(Math.round(proposed.inspector), Math.min(520, width - tree - LIMITS.canvas)),
  );
  return { tree, inspector };
}

export function ResizableWorkspace({
  children,
  className,
  userKey,
}: {
  children: ReactNode;
  className: string;
  userKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ side: Side; x: number; initial: Widths } | null>(null);
  const [widths, setWidths] = useState<Widths>(DEFAULT);
  const [width, setWidth] = useState(1200);
  const [treeOpen, setTreeOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const storageKey = `site-mapper:workspace:s03:v1:${userKey}`;

  useEffect(() => {
    // Delay storage hydration until after the server-rendered layout is mounted.
    // This keeps server and client markup identical during React hydration.
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(storageKey) || 'null',
        ) as Partial<Widths> | null;
        if (
          typeof stored?.tree === 'number' &&
          Number.isFinite(stored.tree) &&
          typeof stored.inspector === 'number' &&
          Number.isFinite(stored.inspector)
        ) {
          setWidths({ tree: stored.tree, inspector: stored.inspector });
        } else {
          setWidths(DEFAULT);
        }
      } catch {
        setWidths(DEFAULT);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const constrained = constrainWorkspaceWidths(width, widths);

  const update = useCallback(
    (next: Widths) => {
      const containerWidth = ref.current?.getBoundingClientRect().width ?? width;
      const safe = constrainWorkspaceWidths(containerWidth, next);
      setWidths(safe);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(safe));
      } catch {
        // Layout preferences are optional; private browsing must remain usable.
      }
    },
    [storageKey, width],
  );

  const handlePointerDown = (side: Side, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || width < 900) return;
    drag.current = { side, x: event.clientX, initial: constrained };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = event.clientX - drag.current.x;
    const { side, initial } = drag.current;
    update({
      tree: side === 'tree' ? initial.tree + delta : initial.tree,
      inspector: side === 'inspector' ? initial.inspector - delta : initial.inspector,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const separator = (side: Side) => (
    <div
      key={side}
      role="separator"
      tabIndex={0}
      aria-label={side === 'tree' ? 'Resize topology tree' : 'Resize inspector'}
      aria-orientation="vertical"
      aria-valuemin={side === 'tree' ? LIMITS.tree : LIMITS.inspector}
      aria-valuemax={side === 'tree' ? 420 : 520}
      aria-valuenow={constrained[side]}
      className={`s03-separator s03-separator--${side}`}
      onPointerDown={(event) => handlePointerDown(side, event)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const direction = side === 'tree' ? 1 : -1;
        const change =
          event.key === 'ArrowRight'
            ? 16 * direction
            : event.key === 'ArrowLeft'
              ? -16 * direction
              : 0;
        update({
          ...constrained,
          [side]:
            event.key === 'Home'
              ? side === 'tree'
                ? LIMITS.tree
                : LIMITS.inspector
              : event.key === 'End'
                ? side === 'tree'
                  ? 420
                  : 520
                : constrained[side] + change,
        });
      }}
    />
  );

  const style = {
    '--s03-tree-width': `${constrained.tree}px`,
    '--s03-inspector-width': `${constrained.inspector}px`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`${className} s03-layout`}
      style={style}
      data-tree-open={treeOpen}
      data-inspector-open={inspectorOpen}
    >
      {children}
      {separator('tree')}
      {separator('inspector')}
      <div className="s03-mobile-controls" role="group" aria-label="Workspace panels">
        <button
          type="button"
          aria-expanded={treeOpen}
          onClick={() => setTreeOpen((value) => !value)}
        >
          {treeOpen ? 'Hide tree' : 'Show tree'}
        </button>
        <button
          type="button"
          aria-expanded={inspectorOpen}
          onClick={() => setInspectorOpen((value) => !value)}
        >
          {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
        </button>
      </div>
      <button
        className="s03-reset"
        type="button"
        title="Restore default panel widths"
        aria-label="Restore default panel widths"
        onClick={() => update(DEFAULT)}
      >
        Reset layout
      </button>
    </div>
  );
}
