'use client';

export type PhysicalPopupKind = 'container' | 'device' | 'panel' | 'endpoint' | 'power';

const popupSizes: Record<PhysicalPopupKind, { width: number; height: number }> = {
  container: { width: 1280, height: 820 },
  device: { width: 1320, height: 860 },
  panel: { width: 1420, height: 900 },
  endpoint: { width: 1180, height: 780 },
  power: { width: 1320, height: 840 },
};

export function openPhysicalPopup(
  href: string,
  kind: PhysicalPopupKind,
  identity: string,
): Window | null {
  const size = popupSizes[kind];
  const screenLeft = window.screenX ?? 0;
  const screenTop = window.screenY ?? 0;
  const viewportWidth = window.outerWidth || window.innerWidth;
  const viewportHeight = window.outerHeight || window.innerHeight;
  const left = Math.max(screenLeft + Math.round((viewportWidth - size.width) / 2), 0);
  const top = Math.max(screenTop + Math.round((viewportHeight - size.height) / 2), 0);
  const name = `site-mapper-${kind}-${identity.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const popup = window.open(
    href,
    name,
    [
      'popup=yes',
      'resizable=yes',
      'scrollbars=no',
      `width=${size.width}`,
      `height=${size.height}`,
      `left=${left}`,
      `top=${top}`,
    ].join(','),
  );

  if (!popup) {
    window.location.href = href;
    return null;
  }

  popup.focus();
  return popup;
}

export function popupKindForTopology(kind: string): PhysicalPopupKind | null {
  if (kind === 'CONTAINER_RACK') return 'container';
  if (kind === 'DEVICE' || kind === 'EQUIPMENT') return 'device';
  if (kind === 'PANEL') return 'panel';
  if (kind === 'BREAKER' || kind === 'HOLDER') return 'endpoint';
  return null;
}
