import { Request, Response } from 'express';
import { deviceService } from '../services/device.service';
import { auditService } from '../services/audit.service';
import { ROLES } from '../config/roles.config';

export const DeviceController = {
  // Enregistrer un nouvel appareil
  async registerDevice(req: Request, res: Response) {
    try {
      const { name, type, userId, userRole, ipAddress, userAgent } = req.body;
      
      // Vérification du type d'appareil autorisé
      const roleConfig = ROLES[userRole];
      if (!roleConfig) {
        return res.status(400).json({ error: 'Rôle utilisateur invalide' });
      }

      if (!roleConfig.allowedDeviceTypes.includes(type)) {
        return res.status(400).json({ 
          error: `Type d'appareil non autorisé pour ce rôle. Types autorisés: ${roleConfig.allowedDeviceTypes.join(', ')}` 
        });
      }

      // Vérification des limites d'appareils
      const limitCheck = await deviceService.checkDeviceLimits(userId, userRole);
      if (!limitCheck.canAdd) {
        return res.status(400).json({ error: limitCheck.reason });
      }

      const device = await deviceService.registerDevice({
        name,
        type,
        userId,
        userRole,
        ipAddress,
        userAgent
      });

      // Journalisation de l'action
      await auditService.logAction({
        userId,
        userName: 'Système',
        userRole,
        action: 'DEVICE_REGISTER',
        resource: `device:${device.id}`,
        details: `Nouvel appareil enregistré: ${name} (${type})`,
        ipAddress
      });

      res.status(201).json({
        success: true,
        device,
        requiresApproval: roleConfig.requiresApproval
      });
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement de l\'appareil:', error);
      res.status(500).json({ error: 'Erreur serveur lors de l\'enregistrement de l\'appareil' });
    }
  },

  // Approuver un appareil (pour les administrateurs)
  async approveDevice(req: Request, res: Response) {
    try {
      const { deviceId } = req.params;
      const { approve } = req.body;
      const { userId, userRole } = req.user; // Supposons que l'utilisateur est authentifié

      // Vérification des permissions
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée' });
      }

      const device = await deviceService.approveDevice(deviceId, approve);
      if (!device) {
        return res.status(404).json({ error: 'Appareil non trouvé' });
      }

      // Journalisation de l'action
      await auditService.logAction({
        userId,
        userName: req.user.userName,
        userRole,
        action: approve ? 'DEVICE_APPROVED' : 'DEVICE_REJECTED',
        resource: `device:${deviceId}`,
        details: `Appareil ${approve ? 'approuvé' : 'rejeté'} par ${req.user.userName}`,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Appareil ${approve ? 'approuvé' : 'rejeté'} avec succès`,
        device
      });
    } catch (error) {
      console.error('Erreur lors de l\'approbation de l\'appareil:', error);
      res.status(500).json({ error: 'Erreur serveur lors de l\'approbation de l\'appareil' });
    }
  },

  // Supprimer un appareil
  async removeDevice(req: Request, res: Response) {
    try {
      const { deviceId } = req.params;
      const { userId, userRole } = req.user;

      const device = await deviceService.getDevice(deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Appareil non trouvé' });
      }

      // Vérification des permissions
      if (userRole !== 'SUPER_ADMIN' && device.userId !== userId) {
        return res.status(403).json({ error: 'Permission refusée' });
      }

      const success = await deviceService.removeDevice(deviceId);
      if (!success) {
        return res.status(404).json({ error: 'Échec de la suppression de l\'appareil' });
      }

      // Journalisation de l'action
      await auditService.logAction({
        userId,
        userName: req.user.userName,
        userRole,
        action: 'DEVICE_REMOVED',
        resource: `device:${deviceId}`,
        details: `Appareil supprimé: ${device.name} (${device.type})`,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Appareil supprimé avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'appareil:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la suppression de l\'appareil' });
    }
  },

  // Obtenir la liste des appareils (pour l'admin)
  async listDevices(req: Request, res: Response) {
    try {
      const { userRole } = req.user;
      const { status, userId } = req.query;

      // Vérification des permissions
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée' });
      }

      let devices;
      if (status === 'online') {
        devices = await deviceService.getDevicesByStatus(true);
      } else if (status === 'offline') {
        devices = await deviceService.getDevicesByStatus(false);
      } else if (status === 'pending') {
        devices = await deviceService.getPendingApprovals();
      } else if (userId) {
        devices = await deviceService.getUserDevices(userId as string);
      } else {
        // Par défaut, retourner tous les appareils
        devices = Array.from((deviceService as any).devices?.values() || []);
      }

      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des appareils:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération des appareils' });
    }
  },

  // Mettre à jour le statut de l'appareil (en ligne/hors ligne)
  async updateDeviceStatus(req: Request, res: Response) {
    try {
      const { deviceId } = req.params;
      const { isOnline } = req.body;

      const device = await deviceService.updateDeviceStatus(deviceId, isOnline);
      if (!device) {
        return res.status(404).json({ error: 'Appareil non trouvé' });
      }

      res.json({
        success: true,
        device
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut de l\'appareil:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du statut de l\'appareil' });
    }
  }
};
