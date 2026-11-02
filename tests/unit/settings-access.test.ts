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

  it('ADMIN sees only Profile, Security and Roles', () => {
    expect(visibleSettingsTabs('ADMIN')).toEqual(['Profile', 'Security', 'Roles']);
    expect(resolveSettingsTab('ADMIN')).toBe('Profile');
    expect(resolveSettingsTab('ADMIN', 'users')).toBe('Profile');
    expect(resolveSettingsTab('ADMIN', 'roles')).toBe('Roles');

    for (const removed of ['data-import', 'drafting', 'system', 'danger-zone']) {
      expect(resolveSettingsTab('ADMIN', removed)).toBe('Profile');
    }
  });

  it('SUPERADMIN sees only the retained settings tabs and defaults to Users', () => {
    expect(visibleSettingsTabs('SUPERADMIN')).toEqual([
      'Profile',
      'Security',
      'Users',
      'Roles',
    ]);
    expect(resolveSettingsTab('SUPERADMIN')).toBe('Users');
    expect(resolveSettingsTab('SUPERADMIN', 'users')).toBe('Users');
    expect(settingsTabSlug('Roles')).toBe('roles');

    for (const removed of ['data-import', 'drafting', 'system', 'danger-zone']) {
      expect(resolveSettingsTab('SUPERADMIN', removed)).toBe('Users');
    }
  });
});
