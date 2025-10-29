import { 
  UserRole, 
  Permission, 
  hasPermission, 
  getRolePrompts, 
  resolveConflictByRole,
  ROLE_PROFILES
} from '../src/config/roles.config';
import { deviceService } from '../src/services/deviceService';
import { auditService } from '../src/services/auditService';

describe('Système de Rôles et Permissions', () => {
  // Réinitialiser les services avant chaque test
  beforeEach(() => {
    (deviceService as any)._clearDevices();
    (auditService as any)._clearLogs();
  });

  describe('Vérification des permissions', () => {
    test('Un USER a la permission READ', () => {
      expect(hasPermission(UserRole.USER, Permission.READ)).toBe(true);
    });

    test('Un USER n\'a pas la permission MANAGE_USERS', () => {
      expect(hasPermission(UserRole.USER, Permission.MANAGE_USERS)).toBe(false);
    });

    test('Un ADMIN a la permission MANAGE_DEVICES', () => {
      expect(hasPermission(UserRole.ADMIN, Permission.MANAGE_DEVICES)).toBe(true);
    });

    test('Un SUPER_ADMIN a toutes les permissions', () => {
      Object.values(Permission).forEach(permission => {
        expect(hasPermission(UserRole.SUPER_ADMIN, permission)).toBe(true);
      });
    });
  });

  describe('Résolution des conflits de rôles', () => {
    test('Un ADMIN peut modifier un USER', () => {
      expect(resolveConflictByRole(UserRole.ADMIN, UserRole.USER)).toBe(true);
    });

    test('Un ADMIN ne peut pas modifier un autre ADMIN', () => {
      expect(resolveConflictByRole(UserRole.ADMIN, UserRole.ADMIN)).toBe(false);
    });

    test('Un SUPER_ADMIN peut modifier un ADMIN', () => {
      expect(resolveConflictByRole(UserRole.SUPER_ADMIN, UserRole.ADMIN)).toBe(true);
    });
  });

  describe('Génération des prompts de rôle', () => {
    test('Le prompt contient les informations du rôle', () => {
      const prompt = getRolePrompts(UserRole.USER);
      expect(prompt).toContain('USER');
      expect(prompt).toContain('Appareils max');
      expect(prompt).toContain('Permissions');
    });
  });

  describe('Gestion des appareils par rôle', () => {
    test('Un USER peut ajouter un appareil mobile', async () => {
      const device = await deviceService.registerDevice({
        userId: 'user1',
        deviceName: 'iPhone 13',
        deviceType: 'MOBILE',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      });
      
      expect(device.deviceId).toBeDefined();
      expect(device.isApproved).toBe(true);
      expect(device.requiresApproval).toBe(false);
    });

    test('Un ADMIN peut approuver un appareil', async () => {
      const device = await deviceService.registerDevice({
        userId: 'user1',
        deviceName: 'Nouveau serveur',
        deviceType: 'SERVER',
        ipAddress: '192.168.1.100',
        userAgent: 'Node.js'
      });

      expect(device.isApproved).toBe(false);
      expect(device.requiresApproval).toBe(true);

      const approvedDevice = await deviceService.approveDevice(device.deviceId, 'admin1');
      expect(approvedDevice.isApproved).toBe(true);
      expect(approvedDevice.requiresApproval).toBe(false);
    });
  });

  describe('Journalisation des actions', () => {
    test('Les actions sont correctement journalisées', async () => {
      // Enregistrer un appareil
      const device = await deviceService.registerDevice({
        userId: 'user1',
        deviceName: 'PC Portable',
        deviceType: 'PC',
        ipAddress: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36'
      });

      // Vérifier que l'action a été journalisée
      const logs = await auditService.getSystemAudit({ action: 'DEVICE_REGISTERED' });
      expect(logs.length).toBe(1);
      expect(logs[0].details).toContain('PC Portable');
      expect(logs[0].userId).toBe('user1');
    });
  });
});
