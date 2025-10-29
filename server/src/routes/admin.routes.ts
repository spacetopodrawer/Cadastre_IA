import { Router } from 'express';
import { UserRole } from '../config/roles.config';
import { deviceService } from '../services/deviceService';
import { auditService } from '../services/auditService';
import { requireRole } from '../middleware/roleCheck.middleware';

const router = Router();

// Middleware pour vérifier les privilèges admin
router.use(requireRole(UserRole.ADMIN));

// Liste tous les utilisateurs (simulé)
router.get('/users', async (req, res) => {
  try {
    // En production, remplacer par un appel à votre service utilisateur
    const users = []; // await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Changer le rôle d'un utilisateur
router.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // En production: await userService.updateUserRole(id, role);
    await auditService.logAction({
      userId: req.user.id,
      action: 'USER_ROLE_UPDATED',
      targetId: id,
      details: `Rôle modifié en ${role}`
    });

    res.json({ message: 'Rôle utilisateur mis à jour' });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du rôle:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle' });
  }
});

// Création d'utilisateurs en masse
router.post('/users/bulk-create', async (req, res) => {
  try {
    const { users } = req.body;
    
    if (!Array.isArray(users)) {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    // En production: const results = await userService.bulkCreateUsers(users);
    const results = { created: users.length, errors: [] };
    
    await auditService.logAction({
      userId: req.user.id,
      action: 'USERS_BULK_CREATED',
      details: `${users.length} utilisateurs créés`
    });

    res.json(results);
  } catch (error) {
    console.error('Erreur lors de la création en masse:', error);
    res.status(500).json({ error: 'Erreur lors de la création en masse' });
  }
});

// Liste tous les appareils
router.get('/devices', async (req, res) => {
  try {
    const { status, type, userId } = req.query;
    let devices = await deviceService.getAllDevices();

    if (status) {
      const isOnline = status === 'online';
      devices = devices.filter(d => d.isOnline === isOnline);
    }
    if (type) {
      devices = devices.filter(d => d.deviceType === type);
    }
    if (userId) {
      devices = devices.filter(d => d.userId === userId);
    }

    res.json(devices);
  } catch (error) {
    console.error('Erreur lors de la récupération des appareils:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des appareils' });
  }
});

// Approuver un appareil
router.post('/approve-device', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'ID d\'appareil requis' });
    }

    const device = await deviceService.approveDevice(deviceId, req.user.id);
    res.json(device);
  } catch (error) {
    console.error('Erreur lors de l\'approbation de l\'appareil:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'approbation de l\'appareil',
      details: error.message 
    });
  }
});

// Supprimer un appareil
router.delete('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deviceService.removeDevice(id, req.user.id);
    res.json({ message: 'Appareil supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'appareil:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression de l\'appareil',
      details: error.message 
    });
  }
});

// Récupérer les logs d'audit
router.get('/audit', async (req, res) => {
  try {
    const { action, userId, startDate, endDate, limit } = req.query;
    
    const logs = await auditService.getSystemAudit({
      action: action as string,
      userId: userId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100
    });

    res.json(logs);
  } catch (error) {
    console.error('Erreur lors de la récupération des logs d\'audit:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des logs d\'audit' });
  }
});

// Détecter les anomalies
router.get('/anomalies', async (req, res) => {
  try {
    const anomalies = await auditService.detectAnomalies();
    res.json(anomalies);
  } catch (error) {
    console.error('Erreur lors de la détection des anomalies:', error);
    res.status(500).json({ error: 'Erreur lors de la détection des anomalies' });
  }
});

export const adminRoutes = router;
