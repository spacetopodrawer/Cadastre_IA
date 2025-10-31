import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabase';

export interface FusionLogEntry {
  id: string;
  timestamp: Date;
  position: {
    lat: number;
    lon: number;
    alt?: number;
  };
  accuracy: number;
  sources: string[];
  status: 'calibrated' | 'raw' | 'offline' | 'conflicted';
  calibrationProfile?: string;
  ocrAnchor?: {
    text: string;
    confidence: number;
    classification: string;
  };
  metadata?: Record<string, any>;
  exportIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class FusionAuditLog {
  private static instance: FusionAuditLog;
  private logs: FusionLogEntry[] = [];
  private readonly STORAGE_KEY = 'fusion_audit_logs';
  private readonly MAX_LOGS = 1000;
  private syncInProgress = false;

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): FusionAuditLog {
    if (!FusionAuditLog.instance) {
      FusionAuditLog.instance = new FusionAuditLog();
    }
    return FusionAuditLog.instance;
  }

  private async loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.logs = parsed.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp),
          createdAt: new Date(log.createdAt),
          updatedAt: new Date(log.updatedAt)
        }));
      }
    } catch (error) {
      console.error('Failed to load fusion logs from storage:', error);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('Failed to save fusion logs to storage:', error);
    }
  }

  public async log(entry: Omit<FusionLogEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const logEntry: FusionLogEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.logs.unshift(logEntry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(0, this.MAX_LOGS);
    }

    this.saveToStorage();
    this.syncWithBackend(); // Non-blocking

    return logEntry.id;
  }

  public async getLogs(limit = 100, offset = 0): Promise<FusionLogEntry[]> {
    return this.logs.slice(offset, offset + limit);
  }

  public async getLogById(id: string): Promise<FusionLogEntry | undefined> {
    return this.logs.find(log => log.id === id);
  }

  public async updateLog(id: string, updates: Partial<FusionLogEntry>): Promise<boolean> {
    const index = this.logs.findIndex(log => log.id === id);
    if (index === -1) return false;

    this.logs[index] = {
      ...this.logs[index],
      ...updates,
      updatedAt: new Date()
    };

    this.saveToStorage();
    this.syncWithBackend(); // Non-blocking

    return true;
  }

  public async addExportReference(logId: string, exportId: string): Promise<boolean> {
    const log = await this.getLogById(logId);
    if (!log) return false;

    const exportIds = [...(log.exportIds || []), exportId];
    return this.updateLog(logId, { exportIds });
  }

  private async syncWithBackend() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      // Get unsynced logs (those without a serverId in metadata)
      const unsynced = this.logs.filter(log => !log.metadata?.serverId);
      
      for (const log of unsynced) {
        try {
          const { data, error } = await supabase
            .from('fusion_logs')
            .insert([{
              position: log.position,
              accuracy: log.accuracy,
              sources: log.sources,
              status: log.status,
              calibration_profile: log.calibrationProfile,
              ocr_anchor: log.ocrAnchor,
              metadata: log.metadata,
              export_ids: log.exportIds
            }])
            .select()
            .single();

          if (error) throw error;
          if (data) {
            // Update local log with server ID
            await this.updateLog(log.id, {
              metadata: {
                ...log.metadata,
                serverId: data.id
              }
            });
          }
        } catch (error) {
          console.error('Failed to sync log to backend:', error);
          // Continue with next log even if one fails
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  public async searchLogs(query: {
    startDate?: Date;
    endDate?: Date;
    minAccuracy?: number;
    status?: FusionLogEntry['status'];
    source?: string;
    calibrationProfile?: string;
    textSearch?: string;
    limit?: number;
    offset?: number;
  }): Promise<FusionLogEntry[]> {
    return this.logs.filter(log => {
      if (query.startDate && log.timestamp < query.startDate) return false;
      if (query.endDate && log.timestamp > query.endDate) return false;
      if (query.minAccuracy !== undefined && log.accuracy > query.minAccuracy) return false;
      if (query.status && log.status !== query.status) return false;
      if (query.source && !log.sources.includes(query.source)) return false;
      if (query.calibrationProfile && log.calibrationProfile !== query.calibrationProfile) return false;
      
      if (query.textSearch) {
        const search = query.textSearch.toLowerCase();
        const matchesText =
          (log.ocrAnchor?.text?.toLowerCase().includes(search) || false) ||
          (log.metadata?.notes?.toLowerCase().includes(search) || false);
        
        if (!matchesText) return false;
      }
      
      return true;
    }).slice(query.offset || 0, (query.offset || 0) + (query.limit || 100));
  }

  public async getStats(): Promise<{
    total: number;
    byStatus: Record<FusionLogEntry['status'], number>;
    bySource: Record<string, number>;
    accuracyStats: {
      min: number;
      max: number;
      avg: number;
    };
  }> {
    const byStatus = this.logs.reduce((acc, log) => {
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySource = this.logs.reduce((acc, log) => {
      log.sources.forEach(source => {
        acc[source] = (acc[source] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const accuracies = this.logs.map(log => log.accuracy).filter(Boolean) as number[];
    
    return {
      total: this.logs.length,
      byStatus: {
        calibrated: byStatus.calibrated || 0,
        raw: byStatus.raw || 0,
        offline: byStatus.offline || 0,
        conflicted: byStatus.conflicted || 0
      },
      bySource,
      accuracyStats: {
        min: accuracies.length ? Math.min(...accuracies) : 0,
        max: accuracies.length ? Math.max(...accuracies) : 0,
        avg: accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0
      }
    };
  }
}

export const fusionAuditLog = FusionAuditLog.getInstance();
