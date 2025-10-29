import { Router } from 'express';
import { DeviceController } from '../controllers/device.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { hasPermission } from '../middleware/permission.middleware';

const router = Router();

// Middleware d'authentification pour toutes les routes
router.use(authenticateJWT);

// Enregistrer un nouvel appareil
router.post('/register', DeviceController.registerDevice);

// Mettre à jour le statut de l'appareil (en ligne/hors ligne)
router.patch('/:deviceId/status', DeviceController.updateDeviceStatus);

// Routes protégées pour les administrateurs
router.use(hasPermission('MANAGE_DEVICES'));

// Obtenir la liste des appareils (avec filtres)
get('/', DeviceController.listDevices);

// Approuver/Rejeter un appareil
router.post('/:deviceId/approve', DeviceController.approveDevice);

// Supprimer un appareil
delete('/:deviceId', DeviceController.removeDevice);

export default router;
