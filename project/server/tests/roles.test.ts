import { UserRole, Permission, hasPermission, resolveConflictByRole, ROLE_PROFILES } from '../src/config/roles.config';
import { canAddDevice, DeviceType } from '../src/config/device.config';

describe('🔐 Tests des Rôles et Permissions', () => {
  test('USER a uniquement permission READ', () => {
    expect(hasPermission(UserRole.USER, Permission.READ)).toBe(true);
    expect(hasPermission(UserRole.USER, Permission.WRITE)).toBe(false);
    expect(hasPermission(UserRole.USER, Permission.DELETE)).toBe(false);
  });

  test('ADMIN a permissions READ, WRITE, DELETE, SYNC', () => {
    expect(hasPermission(UserRole.ADMIN, Permission.READ)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.WRITE)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.DELETE)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.SYNC)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.MANAGE_USERS)).toBe(false);
  });

  test('SUPER_ADMIN a toutes les permissions', () => {
    Object.values(Permission).forEach(perm => {
      expect(hasPermission(UserRole.SUPER_ADMIN, perm)).toBe(true);
    });
  });

  test('Résolution de conflit par hiérarchie de rôles', () => {
    expect(resolveConflictByRole(UserRole.USER, UserRole.ADMIN))
      .toBe(UserRole.ADMIN);
    expect(resolveConflictByRole(UserRole.ADMIN, UserRole.SUPER_ADMIN))
      .toBe(UserRole.SUPER_ADMIN);
    expect(resolveConflictByRole(UserRole.USER, UserRole.SUPER_ADMIN))
      .toBe(UserRole.SUPER_ADMIN);
  });

  test('Mobilité conforme au profil', () => {
    expect(ROLE_PROFILES[UserRole.USER].mobility).toBe('AMOVIBLE');
    expect(ROLE_PROFILES[UserRole.ADMIN].mobility).toBe('SEMI_AMOVIBLE');
    expect(ROLE_PROFILES[UserRole.SUPER_ADMIN].mobility).toBe('NON_AMOVIBLE');
  });
});

describe('📱 Tests des Devices', () => {
  test('USER ne peut pas ajouter un PC serveur', () => {
    const result = canAddDevice(DeviceType.SERVER, UserRole.USER, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('pas autorisé');
  });

  test('ADMIN peut ajouter un mobile', () => {
    const result = canAddDevice(DeviceType.MOBILE, UserRole.ADMIN, 0);
    expect(result.allowed).toBe(true);
  });

  test('Limite de devices respectée', () => {
    const result = canAddDevice(DeviceType.MOBILE, UserRole.USER, 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Limite atteinte');
  });

  test('SUPER_ADMIN peut ajouter un serveur', () => {
    const result = canAddDevice(DeviceType.SERVER, UserRole.SUPER_ADMIN, 0);
    expect(result.allowed).toBe(true);
  });
});

describe('🔄 Tests de Synchronisation', () => {
  test('Priorité de sync conforme au rôle', () => {
    expect(ROLE_PROFILES[UserRole.USER].syncPriority).toBe(3);
    expect(ROLE_PROFILES[UserRole.ADMIN].syncPriority).toBe(7);
    expect(ROLE_PROFILES[UserRole.SUPER_ADMIN].syncPriority).toBe(10);
  });

  test('Résolution de conflit selon stratégie', () => {
    expect(ROLE_PROFILES[UserRole.USER].conflictResolution).toBe('AUTO');
    expect(ROLE_PROFILES[UserRole.ADMIN].conflictResolution).toBe('MANUAL');
    expect(ROLE_PROFILES[UserRole.SUPER_ADMIN].conflictResolution).toBe('HIERARCHICAL');
  });
});
