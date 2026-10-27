import { describe, expect, it } from 'vitest';
import {
  resolveSettingsTab,
  settingsTabSlug,
  visibleSettingsTabs,
} from '@/modules/settings/domain/settings-access';

describe('Settings navigation is independent of session authentication', () => {
  it('STANDARD retains personal Profile and Security, without administrator tabs', () => {
    expect(visibleSettingsTabs('STANDARD')).toEqual(['Profile', 'Security']);
    expect(resolveSettingsTab('STANDARD')).toBe('Profile');
    expect(resolveSettingsTab('STANDARD', 'security')).toBe('Security');
    for (const forbidden of [
      'users',
      'roles',
      'data-import',
      'drafting',
      'system',
      'danger-zone',
    ]) {
      expect(resolveSettingsTab('STANDARD', forbidden)).toBe('Profile');
    }
  });

  it('ADMIN can use administrator settings but cannot expose Users or Danger Zone', () => {
    expect(visibleSettingsTabs('ADMIN')).toEqual([
      'Profile',
      'Security',
      'Roles',
      'Data Import',
      'Drafting',
      'System',
    ]);
    expect(resolveSettingsTab('ADMIN')).toBe('Profile');
    expect(resolveSettingsTab('ADMIN', 'users')).toBe('Profile');
    expect(resolveSettingsTab('ADMIN', 'danger-zone')).toBe('Profile');
    expect(resolveSettingsTab('ADMIN', 'system')).toBe('System');
  });

  it('SUPERADMIN retains all tabs and Users as its default', () => {
    expect(visibleSettingsTabs('SUPERADMIN')).toEqual([
      'Profile',
      'Security',
      'Users',
      'Roles',
      'Data Import',
      'Drafting',
      'System',
      'Danger Zone',
    ]);
    expect(resolveSettingsTab('SUPERADMIN')).toBe('Users');
    expect(resolveSettingsTab('SUPERADMIN', 'danger-zone')).toBe('Danger Zone');
    expect(settingsTabSlug('Danger Zone')).toBe('danger-zone');
  });
});
