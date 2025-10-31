import { EventEmitter } from 'events';
import { Buffer } from 'buffer';
import { GNSSFormatManager } from './GNSSFormatManager';
import { CoordinateSystemManager } from './CoordinateSystemManager';

type CorrectionSource = {
  id: string;
  name: string;
  url: string;
  type: 'NTRIP' | 'RTCM' | 'NMEA' | 'LOCAL' | 'CUSTOM';
  format: 'RTCM3' | 'RTCM2' | 'CMR' | 'RTCA' | 'NMEA';
  requiresAuth: boolean;
  authType?: 'basic' | 'digest' | 'bearer';
  username?: string;
  password?: string;
  mountpoint?: string;
  country?: string;
  location?: {
    lat: number;
    lon: number;
    alt?: number;
  };
  maxDistanceKm?: number;
  active: boolean;
  priority: number;
  lastUsed?: Date;
  lastStatus?: 'connected' | 'error' | 'disconnected';
  error?: string;
};

type CorrectionData = {
  sourceId: string;
  timestamp: Date;
  data: Buffer;
  type: 'RTCM' | 'NMEA' | 'CMR' | 'RTCA';
  messageTypes: number[];
  size: number;
  checksumValid: boolean;
};

type CorrectionStats = {
  bytesReceived: number;
  messagesReceived: number;
  lastMessageTime: Date | null;
  uptime: number; // in seconds
  errors: number;
  lastError?: string;
  messageTypes: Record<number, number>; // messageType -> count
};

class GNSSCorrectionFetcher extends EventEmitter {
  private static instance: GNSSCorrectionFetcher;
  private sources: Map<string, CorrectionSource> = new Map();
  private activeConnections: Map<string, WebSocket | EventSource | NodeJS.Timeout> = new Map();
  private stats: Map<string, CorrectionStats> = new Map();
  private defaultSource: string | null = null;
  private isInitialized = false;
  private reconnectIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds

  private constructor() {
    super();
    this.loadDefaultSources();
  }

  public static getInstance(): GNSSCorrectionFetcher {
    if (!GNSSCorrectionFetcher.instance) {
      GNSSCorrectionFetcher.instance = new GNSSCorrectionFetcher();
    }
    return GNSSCorrectionFetcher.instance;
  }

  /**
   * Initialize the fetcher with default and custom sources
   */
  public async initialize(customSources: CorrectionSource[] = []): Promise<void> {
    if (this.isInitialized) return;
    
    // Add custom sources
    customSources.forEach(source => this.addSource(source));
    
    // Try to load saved sources from local storage
    await this.loadSavedSources();
    
    // Auto-connect to the default source if available
    if (this.defaultSource) {
      try {
        await this.connect(this.defaultSource);
      } catch (error) {
        console.warn('Failed to connect to default source:', error);
      }
    }
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Add a new correction source
   */
  public addSource(source: Omit<CorrectionSource, 'id' | 'active' | 'lastUsed' | 'lastStatus'>, setAsDefault = false): string {
    const id = `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newSource: CorrectionSource = {
      ...source,
      id,
      active: false,
      lastUsed: new Date(),
      lastStatus: 'disconnected',
    };
    
    this.sources.set(id, newSource);
    
    if (setAsDefault || this.sources.size === 1) {
      this.setDefaultSource(id);
    }
    
    this.saveSourcesToStorage();
    this.emit('sourceAdded', { id, source: newSource });
    
    return id;
  }

  /**
   * Update an existing correction source
   */
  public updateSource(id: string, updates: Partial<CorrectionSource>): boolean {
    const source = this.sources.get(id);
    if (!source) return false;
    
    const updatedSource = { ...source, ...updates, id };
    this.sources.set(id, updatedSource);
    
    this.saveSourcesToStorage();
    this.emit('sourceUpdated', { id, source: updatedSource });
    
    return true;
  }

  /**
   * Remove a correction source
   */
  public removeSource(id: string): boolean {
    if (!this.sources.has(id)) return false;
    
    // Disconnect if connected
    if (this.activeConnections.has(id)) {
      this.disconnect(id);
    }
    
    this.sources.delete(id);
    this.stats.delete(id);
    
    // Update default source if needed
    if (this.defaultSource === id) {
      this.defaultSource = this.sources.keys().next().value || null;
    }
    
    this.saveSourcesToStorage();
    this.emit('sourceRemoved', { id });
    
    return true;
  }

  /**
   * Connect to a correction source
   */
  public async connect(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }
    
    // Disconnect if already connected
    if (this.activeConnections.has(sourceId)) {
      this.disconnect(sourceId);
    }
    
    // Clear any existing reconnect attempts
    this.clearReconnectAttempt(sourceId);
    
    try {
      switch (source.type) {
        case 'NTRIP':
          await this.connectNTRIP(source);
          break;
          
        case 'RTCM':
          await this.connectRTCM(source);
          break;
          
        case 'NMEA':
          await this.connectNMEA(source);
          break;
          
        case 'LOCAL':
          await this.connectLocal(source);
          break;
          
        default:
          throw new Error(`Unsupported source type: ${source.type}`);
      }
      
      // Update source status
      this.updateSource(sourceId, {
        active: true,
        lastStatus: 'connected',
        lastUsed: new Date(),
        error: undefined
      });
      
      // Initialize stats if needed
      if (!this.stats.has(sourceId)) {
        this.stats.set(sourceId, {
          bytesReceived: 0,
          messagesReceived: 0,
          lastMessageTime: null,
          uptime: 0,
          errors: 0,
          messageTypes: {}
        });
      }
      
      // Start uptime counter
      this.startUptimeCounter(sourceId);
      
      this.emit('connected', { sourceId });
      
    } catch (error) {
      console.error(`Failed to connect to ${sourceId}:`, error);
      
      // Update source status
      this.updateSource(sourceId, {
        active: false,
        lastStatus: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Schedule reconnection
      this.scheduleReconnect(sourceId);
      
      throw error;
    }
  }

  /**
   * Disconnect from a correction source
   */
  public disconnect(sourceId: string): void {
    const connection = this.activeConnections.get(sourceId);
    if (!connection) return;
    
    // Clean up based on connection type
    if (connection instanceof WebSocket) {
      connection.close();
    } else if (connection instanceof EventSource) {
      connection.close();
    } else if (typeof connection === 'number') {
      clearInterval(connection);
    }
    
    this.activeConnections.delete(sourceId);
    this.clearReconnectAttempt(sourceId);
    
    // Update source status
    this.updateSource(sourceId, {
      active: false,
      lastStatus: 'disconnected'
    });
    
    // Stop uptime counter
    this.stopUptimeCounter(sourceId);
    
    this.emit('disconnected', { sourceId });
  }

  /**
   * Set the default correction source
   */
  public setDefaultSource(sourceId: string): boolean {
    if (!this.sources.has(sourceId)) return false;
    
    this.defaultSource = sourceId;
    localStorage.setItem('gnssCorrectionDefaultSource', sourceId);
    
    this.emit('defaultSourceChanged', { sourceId });
    
    return true;
  }

  /**
   * Get the current default source
   */
  public getDefaultSource(): CorrectionSource | null {
    return this.defaultSource ? this.sources.get(this.defaultSource) || null : null;
  }

  /**
   * Get all available sources
   */
  public getSources(): CorrectionSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get statistics for a source
   */
  public getStats(sourceId: string): CorrectionStats | null {
    return this.stats.get(sourceId) || null;
  }

  /**
   * Find the best available correction source based on location
   */
  public findBestSource(lat: number, lon: number, alt?: number): CorrectionSource | null {
    let bestSource: CorrectionSource | null = null;
    let bestScore = -Infinity;
    
    for (const source of this.sources.values()) {
      if (!source.location) continue;
      
      // Calculate distance to source
      const distance = CoordinateSystemManager.calculateDistance(
        { x: lon, y: lat, z: alt },
        { x: source.location.lon, y: source.location.lat, z: source.location.alt },
        'EPSG:4326'
      );
      
      // Skip if too far away
      if (source.maxDistanceKm && distance > source.maxDistanceKm * 1000) {
        continue;
      }
      
      // Calculate score based on distance and priority
      const distanceScore = 1 / (1 + distance / 1000); // Convert to km and normalize
      const priorityScore = source.priority / 10; // Normalize priority (assuming max 10)
      const score = distanceScore * 0.7 + priorityScore * 0.3;
      
      if (score > bestScore) {
        bestScore = score;
        bestSource = source;
      }
    }
    
    return bestSource;
  }

  /**
   * Auto-connect to the best available source
   */
  public async autoConnect(lat: number, lon: number, alt?: number): Promise<string | null> {
    const bestSource = this.findBestSource(lat, lon, alt);
    
    if (bestSource) {
      try {
        await this.connect(bestSource.id);
        this.setDefaultSource(bestSource.id);
        return bestSource.id;
      } catch (error) {
        console.warn('Failed to connect to best source, trying next best...', error);
        // Try next best source recursively
        const remainingSources = this.getSources().filter(s => s.id !== bestSource.id);
        if (remainingSources.length > 0) {
          return this.autoConnect(lat, lon, alt);
        }
      }
    }
    
    return null;
  }

  private async connectNTRIP(source: CorrectionSource): Promise<void> {
    if (!source.url) {
      throw new Error('NTRIP source URL is required');
    }
    
    const url = new URL(source.url);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${url.host}${url.pathname}`;
    
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        
        ws.binaryType = 'arraybuffer';
        
        ws.onopen = () => {
          // Send NTRIP authentication if needed
          if (source.requiresAuth && source.username && source.password) {
            const auth = btoa(`${source.username}:${source.password}`);
            ws.send(`GET ${url.pathname} HTTP/1.1\r\n`);
            ws.send(`Authorization: Basic ${auth}\r\n\r\n`);
          }
          
          this.activeConnections.set(source.id, ws);
          resolve();
        };
        
        ws.onmessage = (event) => {
          const data = event.data instanceof ArrayBuffer 
            ? Buffer.from(event.data)
            : Buffer.from(event.data);
          
          this.handleCorrectionData(source.id, data, 'RTCM');
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('WebSocket connection error'));
        };
        
        ws.onclose = () => {
          if (this.activeConnections.get(source.id) === ws) {
            this.activeConnections.delete(source.id);
            this.scheduleReconnect(source.id);
          }
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectRTCM(source: CorrectionSource): Promise<void> {
    // Similar to NTRIP but for direct RTCM streams
    return this.connectNTRIP(source);
  }

  private async connectNMEA(source: CorrectionSource): Promise<void> {
    if (!source.url) {
      throw new Error('NMEA source URL is required');
    }
    
    const url = new URL(source.url);
    
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      return this.connectNTRIP(source); // Reuse WebSocket logic
    }
    
    // For HTTP/HTTPS, use EventSource or polling
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      // Simple polling implementation
      const poll = async () => {
        try {
          const response = await fetch(source.url, {
            headers: source.requiresAuth && source.username && source.password
              ? { 'Authorization': `Basic ${btoa(`${source.username}:${source.password}`)}` }
              : {}
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }
          
          const data = await response.arrayBuffer();
          this.handleCorrectionData(source.id, Buffer.from(data), 'NMEA');
          
        } catch (error) {
          console.error('Polling error:', error);
          this.handleSourceError(source.id, error);
        }
      };
      
      // Initial poll
      await poll();
      
      // Set up polling interval
      const interval = setInterval(poll, 5000) as unknown as NodeJS.Timeout;
      this.activeConnections.set(source.id, interval);
      
      return;
    }
    
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  private async connectLocal(source: CorrectionSource): Promise<void> {
    // For local connections (e.g., serial port, Bluetooth)
    // This would be implemented based on the platform
    throw new Error('Local connections not yet implemented');
  }

  private handleCorrectionData(sourceId: string, data: Buffer, type: 'RTCM' | 'NMEA' | 'CMR' | 'RTCA'): void {
    const stats = this.stats.get(sourceId) || {
      bytesReceived: 0,
      messagesReceived: 0,
      lastMessageTime: null,
      uptime: 0,
      errors: 0,
      messageTypes: {}
    };
    
    // Update stats
    stats.bytesReceived += data.length;
    stats.messagesReceived++;
    stats.lastMessageTime = new Date();
    
    // Parse message types (for RTCM)
    if (type === 'RTCM' && data.length >= 3) {
      const messageType = (data[1] << 4) | (data[2] >> 4);
      stats.messageTypes[messageType] = (stats.messageTypes[messageType] || 0) + 1;
    }
    
    this.stats.set(sourceId, stats);
    
    // Emit the correction data
    const correctionData: CorrectionData = {
      sourceId,
      timestamp: new Date(),
      data,
      type,
      messageTypes: type === 'RTCM' ? this.parseRTCMessageTypes(data) : [],
      size: data.length,
      checksumValid: this.validateChecksum(data, type)
    };
    
    this.emit('data', correctionData);
  }

  private parseRTCMessageTypes(data: Buffer): number[] {
    if (data.length < 3) return [];
    
    const messageType = (data[1] << 4) | (data[2] >> 4);
    return [messageType];
  }

  private validateChecksum(data: Buffer, type: string): boolean {
    // Implement checksum validation based on message type
    // This is a simplified version
    if (type === 'NMEA') {
      return GNSSFormatManager.validateNMEAChecksum(data.toString());
    }
    
    // For RTCM, we'd need to implement the proper CRC-24Q validation
    return true; // Assume valid for now
  }

  private handleSourceError(sourceId: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Update stats
    const stats = this.stats.get(sourceId);
    if (stats) {
      stats.errors++;
      stats.lastError = errorMessage;
    }
    
    // Update source status
    this.updateSource(sourceId, {
      lastStatus: 'error',
      error: errorMessage
    });
    
    // Schedule reconnection
    this.scheduleReconnect(sourceId);
    
    this.emit('error', { sourceId, error: errorMessage });
  }

  private scheduleReconnect(sourceId: string): void {
    // Don't schedule multiple reconnection attempts
    if (this.reconnectIntervals.has(sourceId)) return;
    
    let attempts = 0;
    
    const attemptReconnect = () => {
      attempts++;
      
      if (attempts > this.MAX_RECONNECT_ATTEMPTS) {
        console.warn(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${sourceId}`);
        this.clearReconnectAttempt(sourceId);
        return;
      }
      
      console.log(`Reconnection attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS} for ${sourceId}`);
      
      this.connect(sourceId)
        .then(() => {
          console.log(`Successfully reconnected to ${sourceId}`);
          this.clearReconnectAttempt(sourceId);
        })
        .catch(() => {
          // Continue with the next attempt
        });
    };
    
    // Initial attempt after delay
    const interval = setTimeout(() => {
      attemptReconnect();
      
      // Subsequent attempts with exponential backoff
      const retryInterval = setInterval(() => {
        if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
          clearInterval(retryInterval);
          return;
        }
        attemptReconnect();
      }, this.RECONNECT_DELAY * Math.pow(2, attempts));
      
      // Store the interval ID so we can clear it later
      this.reconnectIntervals.set(sourceId, retryInterval as unknown as NodeJS.Timeout);
    }, this.RECONNECT_DELAY);
    
    this.reconnectIntervals.set(sourceId, interval);
  }

  private clearReconnectAttempt(sourceId: string): void {
    const interval = this.reconnectIntervals.get(sourceId);
    if (interval) {
      clearTimeout(interval as unknown as number);
      clearInterval(interval as unknown as number);
      this.reconnectIntervals.delete(sourceId);
    }
  }

  private startUptimeCounter(sourceId: string): void {
    // Update uptime every second
    const interval = setInterval(() => {
      const stats = this.stats.get(sourceId);
      if (stats) {
        stats.uptime++;
        this.stats.set(sourceId, stats);
      }
    }, 1000) as unknown as NodeJS.Timeout;
    
    this.activeConnections.set(`uptime_${sourceId}`, interval);
  }

  private stopUptimeCounter(sourceId: string): void {
    const interval = this.activeConnections.get(`uptime_${sourceId}`);
    if (interval) {
      clearInterval(interval as unknown as number);
      this.activeConnections.delete(`uptime_${sourceId}`);
    }
  }

  private loadDefaultSources(): void {
    // Add some default public NTRIP sources (these are just examples)
    const defaultSources: Omit<CorrectionSource, 'id'>[] = [
      {
        name: 'EUREF NTRIP Network',
        url: 'https://www.epncb.oma.be/ntrip',
        type: 'NTRIP',
        format: 'RTCM3',
        requiresAuth: false,
        country: 'EU',
        location: { lat: 50.8503, lon: 4.3517 }, // Brussels
        maxDistanceKm: 1000,
        priority: 5,
      },
      {
        name: 'SAPOS (Germany)',
        url: 'https://www.sapos.de/ntrip',
        type: 'NTRIP',
        format: 'RTCM3',
        requiresAuth: true,
        authType: 'basic',
        country: 'DE',
        location: { lat: 51.1657, lon: 10.4515 }, // Germany center
        maxDistanceKm: 300,
        priority: 7,
      },
      // Add more default sources as needed
    ];
    
    defaultSources.forEach(source => this.addSource(source));
  }

  private async loadSavedSources(): Promise<void> {
    try {
      const saved = localStorage.getItem('gnssCorrectionSources');
      if (!saved) return;
      
      const sources = JSON.parse(saved) as CorrectionSource[];
      
      // Clear default sources if we have saved ones
      if (sources.length > 0) {
        this.sources.clear();
      }
      
      // Add saved sources
      sources.forEach(source => {
        this.sources.set(source.id, {
          ...source,
          lastUsed: source.lastUsed ? new Date(source.lastUsed) : new Date(),
        });
      });
      
      // Load default source
      const defaultSourceId = localStorage.getItem('gnssCorrectionDefaultSource');
      if (defaultSourceId && this.sources.has(defaultSourceId)) {
        this.defaultSource = defaultSourceId;
      }
      
    } catch (error) {
      console.error('Failed to load saved sources:', error);
    }
  }

  private saveSourcesToStorage(): void {
    try {
      const sources = Array.from(this.sources.values()).map(source => ({
        ...source,
        // Don't store active connections or sensitive data
        active: undefined,
        lastStatus: undefined,
        error: undefined,
        // Convert Date to string for serialization
        lastUsed: source.lastUsed?.toISOString()
      }));
      
      localStorage.setItem('gnssCorrectionSources', JSON.stringify(sources));
      
    } catch (error) {
      console.error('Failed to save sources:', error);
    }
  }
}

// Singleton instance
export const gnssCorrectionFetcher = GNSSCorrectionFetcher.getInstance();

export type { CorrectionSource, CorrectionData, CorrectionStats };
