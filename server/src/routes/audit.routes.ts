import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { hasPermission } from '../middleware/permission.middleware';

const router = Router();

// Middleware d'authentification pour toutes les routes
router.use(authenticateJWT);

// Seul le SUPER_ADMIN peut accéder aux journaux d'audit
router.use(hasPermission('AUDIT'));

// Récupérer les journaux d'audit avec filtres
router.get('/logs', AuditController.getAuditLogs);

// Exporter les journaux d'audit au format CSV
router.get('/export', AuditController.exportAuditLogs);

// Obtenir les statistiques d'audit
router.get('/stats', AuditController.getAuditStats);

// Nettoyer les anciens journaux (maintenance)
router.post('/cleanup', AuditController.cleanupOldLogs);

export default router;
