import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  deviceId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  status: 'success' | 'failure' | 'warning' | 'info';
}

class FusionAuditLog {
  private static instance: FusionAuditLog;
  private logs: Map<string, AuditLogEntry> = new Map();
  private maxLogEntries = 1000; // Keep last 1000 entries in memory
  private logQueue: AuditLogEntry[] = [];
  private isProcessing = false;

  private constructor() {
    // Initialize with some sample logs
    this.initializeSampleLogs();
  }

  public static getInstance(): FusionAuditLog {
    if (!FusionAuditLog.instance) {
      FusionAuditLog.instance = new FusionAuditLog();
    }
    return FusionAuditLog.instance;
  }

  private initializeSampleLogs(): void {
    const now = new Date();
    const sampleLogs: AuditLogEntry[] = [
      {
        id: uuidv4(),
        timestamp: new Date(now.getTime() - 1000 * 60 * 5), // 5 minutes ago
        action: 'device_connected',
        deviceId: 'dev-wifi-001',
        status: 'success',
        details: {
          protocol: 'MQTT',
          ipAddress: '192.168.1.10',
          signalStrength: 85
        }
      },
      {
        id: uuidv4(),
        timestamp: new Date(now.getTime() - 1000 * 60 * 15), // 15 minutes ago
        action: 'device_disconnected',
        deviceId: 'dev-gsm-001',
        status: 'warning',
        details: {
          reason: 'connection_timeout',
          lastSeen: new Date(now.getTime() - 1000 * 60 * 16).toISOString()
        }
      },
      {
        id: uuidv4(),
        timestamp: new Date(now.getTime() - 1000 * 60 * 30), // 30 minutes ago
        action: 'token_generated',
        deviceId: 'dev-uhf-001',
        status: 'success',
        details: {
          tokenId: 'token-001',
          expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days from now
        }
      },
      {
        id: uuidv4(),
        timestamp: new Date(now.getTime() - 1000 * 60 * 60), // 1 hour ago
        action: 'unauthorized_access_attempt',
        deviceId: 'unknown',
        status: 'failure',
        details: {
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          reason: 'invalid_token'
        }
      }
    ];

    sampleLogs.forEach(log => this.logs.set(log.id, log));
  }

  public async logSecurityEvent(params: {
    action: string;
    deviceId: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
    status?: 'success' | 'failure' | 'warning' | 'info';
  }): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      action: params.action,
      deviceId: params.deviceId,
      userId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: params.details || {},
      status: params.status || 'info'
    };

    // Add to queue for async processing
    this.logQueue.push(logEntry);
    
    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processQueue();
    }

    return logEntry;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Process all logs in the queue
      while (this.logQueue.length > 0) {
        const logEntry = this.logQueue.shift();
        if (!logEntry) continue;
        
        // Store the log
        this.logs.set(logEntry.id, logEntry);
        
        // Enforce max log size
        if (this.logs.size > this.maxLogEntries) {
          // Remove oldest logs (first 10% of max entries)
          const entriesToRemove = Array.from(this.logs.entries())
            .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
            .slice(0, Math.floor(this.maxLogEntries * 0.1));
          
          entriesToRemove.forEach(([id]) => this.logs.delete(id));
        }
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public async getLogs(params?: {
    deviceId?: string;
    action?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const { 
      deviceId, 
      action, 
      status, 
      startDate, 
      endDate, 
      limit = 100, 
      offset = 0 
    } = params || {};

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));

    let logs = Array.from(this.logs.values());
    
    // Filter logs based on parameters
    if (deviceId) {
      logs = logs.filter(log => log.deviceId === deviceId);
    }
    
    if (action) {
      logs = logs.filter(log => log.action === action);
    }
    
    if (status) {
      logs = logs.filter(log => log.status === status);
    }
    
    if (startDate) {
      logs = logs.filter(log => log.timestamp >= startDate);
    }
    
    if (endDate) {
      logs = logs.filter(log => log.timestamp <= endDate);
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    return logs.slice(offset, offset + limit);
  }

  public async getDeviceLogs(deviceId: string, limit: number = 20): Promise<AuditLogEntry[]> {
    return this.getLogs({ deviceId, limit });
  }

  public async getRecentLogs(limit: number = 50): Promise<AuditLogEntry[]> {
    return this.getLogs({ limit });
  }

  public async searchLogs(query: string, limit: number = 50): Promise<AuditLogEntry[]> {
    if (!query) return this.getRecentLogs(limit);
    
    const logs = await this.getLogs({ limit: 1000 }); // Get more logs for better search results
    
    const queryLower = query.toLowerCase();
    return logs.filter(log => 
      log.action.toLowerCase().includes(queryLower) ||
      log.deviceId.toLowerCase().includes(queryLower) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(queryLower))
    ).slice(0, limit);
  }
}

export const fusionAuditLog = FusionAuditLog.getInstance();

// For backward compatibility
export default {
  logSecurityEvent: (params: any) => fusionAuditLog.logSecurityEvent(params),
  getLogs: (params?: any) => fusionAuditLog.getLogs(params),
  getDeviceLogs: (deviceId: string, limit?: number) => 
    fusionAuditLog.getDeviceLogs(deviceId, limit),
  getRecentLogs: (limit?: number) => fusionAuditLog.getRecentLogs(limit),
  searchLogs: (query: string, limit?: number) => fusionAuditLog.searchLogs(query, limit)
};
