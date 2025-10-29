import request from 'supertest';
import { app } from '../../src/index';
import { UserRole } from '../../src/config/roles.config';
import { deviceService } from '../../src/services/deviceService';
import { auditService } from '../../src/services/auditService';

// Configuration des mocks pour les tests
describe('Routes Administrateur', () => {
  // Données de test
  const testUser = {
    id: 'test-admin',
    email: 'admin@test.com',
    role: UserRole.ADMIN
  };

  // Réinitialiser les services avant chaque test
  beforeEach(() => {
    (deviceService as any)._clearDevices();
    (auditService as any)._clearLogs();
  });

  describe('GET /api/admin/users', () => {
    it('devrait retourner la liste des utilisateurs', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('PUT /api/admin/users/:id/role', () => {
    it('devrait mettre à jour le rôle d\'un utilisateur', async () => {
      const userId = 'user-123';
      const newRole = UserRole.ADMIN;

      const response = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .send({ role: newRole })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Rôle utilisateur mis à jour');

      // Vérifier que l'action a été journalisée
      const logs = await auditService.getSystemAudit({ action: 'USER_ROLE_UPDATED' });
      expect(logs.length).toBe(1);
      expect(logs[0].targetId).toBe(userId);
    });

    it('devrait refuser un rôle invalide', async () => {
      const response = await request(app)
        .put('/api/admin/users/user-123/role')
        .send({ role: 'INVALID_ROLE' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Gestion des appareils', () => {
    let testDeviceId: string;

    beforeAll(async () => {
      // Créer un appareil de test
      const device = await deviceService.registerDevice({
        userId: 'test-user',
        deviceName: 'Test Device',
        deviceType: 'SERVER',
        ipAddress: '192.168.1.2',
        userAgent: 'Test Agent'
      });
      testDeviceId = device.deviceId;
    });

    it('devrait lister tous les appareils', async () => {
      const response = await request(app)
        .get('/api/admin/devices')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('devrait approuver un appareil', async () => {
      const response = await request(app)
        .post('/api/admin/approve-device')
        .send({ deviceId: testDeviceId })
        .expect(200);

      expect(response.body).toHaveProperty('isApproved', true);
      
      // Vérifier que l'appareil est bien approuvé
      const device = await deviceService.getDeviceById(testDeviceId);
      expect(device?.isApproved).toBe(true);
    });

    it('devrait supprimer un appareil', async () => {
      await request(app)
        .delete(`/api/admin/devices/${testDeviceId}`)
        .expect(200);
      
      // Vérifier que l'appareil a bien été supprimé
      const device = await deviceService.getDeviceById(testDeviceId);
      expect(device).toBeUndefined();
    });
  });

  describe('Journal d\'audit', () => {
    it('devrait retourner les logs d\'audit', async () => {
      // Créer une entrée de test
      await auditService.logAction({
        userId: 'test-user',
        action: 'TEST_ACTION',
        details: 'Test audit entry'
      });

      const response = await request(app)
        .get('/api/admin/audit')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('devrait détecter les anomalies', async () => {
      // Générer des logs suspects
      for (let i = 0; i < 15; i++) {
        await auditService.logAction({
          userId: 'suspicious-user',
          action: 'LOGIN_FAILED',
          details: 'Failed login attempt'
        });
      }

      const response = await request(app)
        .get('/api/admin/anomalies')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('anomaly');
      expect(response.body[0]).toHaveProperty('count');
    });
  });
});
