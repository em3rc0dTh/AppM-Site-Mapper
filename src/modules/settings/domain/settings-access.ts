import type { Role } from '@/modules/identity/domain/roles';
import { hasPermission } from '@/modules/identity/domain/roles';

/** Route-level visibility. Server API authorization remains authoritative. */
export const settingsTabs = ['Profile', 'Security', 'Users', 'Roles'] as const;

export type SettingsTab = (typeof settingsTabs)[number];

export function settingsTabSlug(tab: SettingsTab): string {
  return tab.toLowerCase().replaceAll(' ', '-');
}

export function visibleSettingsTabs(role: Role): readonly SettingsTab[] {
  return settingsTabs.filter((tab) => {
    switch (tab) {
      case 'Profile':
      case 'Security':
        return true;
      case 'Users':
        return hasPermission(role, 'users:manage');
      case 'Roles':
        return hasPermission(role, 'settings:read');
    }
  });
}

export function resolveSettingsTab(role: Role, requested?: string): SettingsTab {
  const visible = visibleSettingsTabs(role);
  const requestedTab = visible.find((tab) => settingsTabSlug(tab) === requested);
  if (requestedTab) return requestedTab;
  return role === 'SUPERADMIN' ? 'Users' : 'Profile';
}
