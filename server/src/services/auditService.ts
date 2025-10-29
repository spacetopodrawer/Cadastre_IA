import { v4 as uuidv4 } from 'uuid';

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  targetId?: string;
  details: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Simule une base de données en mémoire pour les logs
const auditLogs: AuditLog[] = [];

export const auditService = {
  async logAction(data: {
    userId: string;
    action: string;
    targetId?: string;
    details: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const log: AuditLog = {
      id: uuidv4(),
      timestamp: new Date(),
      ...data
    };
    
    auditLogs.push(log);
    return log;
  },

  async getUserAudit(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return auditLogs
      .filter(log => log.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  },

  async getSystemAudit(filters: {
    action?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<AuditLog[]> {
    const {
      action,
      userId,
      startDate,
      endDate,
      limit = 100
    } = filters;

    return auditLogs
      .filter(log => {
        if (action && log.action !== action) return false;
        if (userId && log.userId !== userId) return false;
        if (startDate && log.timestamp < startDate) return false;
        if (endDate && log.timestamp > endDate) return false;
        return true;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  },

  async detectAnomalies(): Promise<{ anomaly: string; count: number }[]> {
    const anomalies: { [key: string]: number } = {};
    const oneHourAgo = new Date(Date.now() - 3600000);
    
    // Compte le nombre d'échecs de connexion par utilisateur
    const failedLogins = auditLogs.filter(
      log => log.action === 'LOGIN_FAILED' && log.timestamp > oneHourAgo
    );
    
    failedLogins.forEach(log => {
      const key = `Trop de tentatives de connexion échouées pour l'utilisateur ${log.userId}`;
      anomalies[key] = (anomalies[key] || 0) + 1;
    });
    
    // Détecte les actions suspectes (ex: suppression massive)
    const massDeletions = auditLogs.filter(
      log => log.action.includes('DELETE') && log.timestamp > oneHourAgo
    ).length;
    
    if (massDeletions > 10) {
      anomalies['Suppression massive détectée'] = massDeletions;
    }
    
    return Object.entries(anomalies)
      .map(([anomaly, count]) => ({ anomaly, count }))
      .sort((a, b) => b.count - a.count);
  },
  
  // Méthode utilitaire pour les tests
  _clearLogs(): void {
    auditLogs.length = 0;
  }
};

// Export pour les tests
if (process.env.NODE_ENV === 'test') {
  (auditService as any).auditLogs = auditLogs;
}
