import { Request, Response } from 'express';
import { auditService } from '../services/audit.service';

export const AuditController = {
  // Récupérer les journaux d'audit avec filtres
  async getAuditLogs(req: Request, res: Response) {
    try {
      const { userId, action, resource, dateFrom, dateTo, limit } = req.query;
      
      // Vérification des permissions
      if (req.user.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée. Seul un SUPER_ADMIN peut accéder aux journaux d\'audit.' });
      }

      // Conversion des dates si elles sont fournies
      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (action) filters.action = action as string;
      if (resource) filters.resource = resource as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      if (limit) filters.limit = parseInt(limit as string, 10);

      const logs = await auditService.getLogs(filters);

      res.json({
        success: true,
        count: logs.length,
        logs
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des journaux d\'audit:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération des journaux d\'audit' });
    }
  },

  // Exporter les journaux d'audit au format CSV
  async exportAuditLogs(req: Request, res: Response) {
    try {
      const { userId, action, dateFrom, dateTo } = req.query;
      
      // Vérification des permissions
      if (req.user.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée. Seul un SUPER_ADMIN peut exporter les journaux d\'audit.' });
      }

      // Préparation des filtres
      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (action) filters.action = action as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);

      // Génération du CSV
      const csvContent = await auditService.exportToCSV(filters);
      
      // Configuration de la réponse pour le téléchargement
      const date = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${date}.csv`);
      
      res.send(csvContent);
    } catch (error) {
      console.error('Erreur lors de l\'exportation des journaux d\'audit:', error);
      res.status(500).json({ error: 'Erreur serveur lors de l\'exportation des journaux d\'audit' });
    }
  },

  // Nettoyer les anciens journaux (maintenance)
  async cleanupOldLogs(req: Request, res: Response) {
    try {
      const { retentionDays } = req.body;
      
      // Vérification des permissions
      if (req.user.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée' });
      }

      const days = retentionDays ? parseInt(retentionDays as string, 10) : 365;
      const removedCount = await auditService.cleanupOldLogs(days);

      // Journalisation de l'action
      await auditService.logAction({
        userId: req.user.userId,
        userName: req.user.userName,
        userRole: req.user.userRole,
        action: 'AUDIT_CLEANUP',
        resource: 'audit-logs',
        details: `Nettoyage des journaux d'audit - ${removedCount} entrées supprimées (rétention: ${days} jours)`,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Nettoyage effectué. ${removedCount} entrées supprimées.`,
        retentionDays: days
      });
    } catch (error) {
      console.error('Erreur lors du nettoyage des journaux d\'audit:', error);
      res.status(500).json({ error: 'Erreur serveur lors du nettoyage des journaux d\'audit' });
    }
  },

  // Obtenir les statistiques d'audit
  async getAuditStats(req: Request, res: Response) {
    try {
      // Vérification des permissions
      if (req.user.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission refusée' });
      }

      const allLogs = await auditService.getLogs({});
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentLogs = allLogs.filter(log => log.timestamp >= thirtyDaysAgo);
      
      // Comptage des actions par type
      const actionCounts = recentLogs.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Comptage des actions par utilisateur
      const userActivity = recentLogs.reduce((acc, log) => {
        if (!acc[log.userId]) {
          acc[log.userId] = {
            userName: log.userName,
            userRole: log.userRole,
            actionCount: 0,
            lastActivity: log.timestamp
          };
        }
        acc[log.userId].actionCount += 1;
        if (log.timestamp > acc[log.userId].lastActivity) {
          acc[log.userId].lastActivity = log.timestamp;
        }
        return acc;
      }, {} as Record<string, { userName: string; userRole: string; actionCount: number; lastActivity: Date }>);

      // Conversion en tableau et tri
      const topUsers = Object.entries(userActivity)
        .map(([userId, data]) => ({
          userId,
          ...data
        }))
        .sort((a, b) => b.actionCount - a.actionCount)
        .slice(0, 10); // Top 10 des utilisateurs les plus actifs

      res.json({
        success: true,
        stats: {
          totalLogs: allLogs.length,
          recentLogs: recentLogs.length,
          actionCounts,
          topUsers,
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques d\'audit:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération des statistiques d\'audit' });
    }
  }
};
