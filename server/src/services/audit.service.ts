import { AuditLogEntry } from '../types/roles';

export class AuditService {
  private logs: AuditLogEntry[] = [];
  private readonly MAX_LOG_ENTRIES = 10000; // Limite de 10 000 entrées

  async logAction(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date()
    };

    this.logs.unshift(logEntry); // Ajoute au début pour un accès plus rapide aux entrées récentes

    // Gestion de la taille maximale du journal
    if (this.logs.length > this.MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, this.MAX_LOG_ENTRIES);
    }

    return logEntry;
  }

  async getLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  } = {}): Promise<AuditLogEntry[]> {
    let result = [...this.logs];

    if (filters.userId) {
      result = result.filter(entry => entry.userId === filters.userId);
    }

    if (filters.action) {
      result = result.filter(entry => entry.action === filters.action);
    }

    if (filters.resource) {
      result = result.filter(entry => entry.resource.includes(filters.resource as string));
    }

    if (filters.dateFrom) {
      result = result.filter(entry => entry.timestamp >= (filters.dateFrom as Date));
    }

    if (filters.dateTo) {
      // Ajoute un jour pour inclure toute la journée
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      result = result.filter(entry => entry.timestamp <= endOfDay);
    }

    if (filters.limit) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  async getLogById(logId: string): Promise<AuditLogEntry | undefined> {
    return this.logs.find(log => log.id === logId);
  }

  async exportToCSV(filters: {
    userId?: string;
    action?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<string> {
    const logs = await this.getLogs(filters);
    
    // En-têtes CSV
    const headers = [
      'Timestamp',
      'User ID',
      'User Name',
      'User Role',
      'Action',
      'Resource',
      'Details',
      'IP Address'
    ];

    // Données
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.userId,
      log.userName,
      log.userRole,
      log.action,
      log.resource,
      log.details.replace(/[",\n]/g, ' '), // Nettoyage pour le format CSV
      log.ipAddress
    ]);

    // Échappement des valeurs pour le CSV
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' ? escapeCsv(cell) : cell
      ).join(','))
    ].join('\n');

    return csvContent;
  }

  // Méthode de maintenance
  async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const initialCount = this.logs.length;
    this.logs = this.logs.filter(log => log.timestamp >= cutoffDate);
    
    return initialCount - this.logs.length;
  }

  private generateId(): string {
    return 'log_' + Math.random().toString(36).substr(2, 9);
  }
}

export const auditService = new AuditService();
