import { v4 as uuidv4 } from 'uuid';

type DeviceType = 'wifi' | 'gsm' | 'uhf';
type DeviceStatus = 'online' | 'offline' | 'error';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  protocol: string;
  lastSeen: Date;
  status: DeviceStatus;
  ipAddress?: string;
  signalStrength?: number;
  firmwareVersion?: string;
}

class RemoteLinkManager {
  private static instance: RemoteLinkManager;
  private devices: Map<string, Device> = new Map();
  private connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000; // 5 seconds
  private eventListeners: Map<string, Set<Function>> = new Map();

  private constructor() {
    this.initializeMockDevices();
    this.simulateDeviceActivity();
  }

  public static getInstance(): RemoteLinkManager {
    if (!RemoteLinkManager.instance) {
      RemoteLinkManager.instance = new RemoteLinkManager();
    }
    return RemoteLinkManager.instance;
  }

  private initializeMockDevices(): void {
    // Add some mock devices for demonstration
    const mockDevices: Device[] = [
      {
        id: 'dev-wifi-001',
        name: 'Drone Principal',
        type: 'wifi',
        protocol: 'MQTT',
        lastSeen: new Date(),
        status: 'online',
        ipAddress: '192.168.1.10',
        signalStrength: 85,
        firmwareVersion: '1.2.3'
      },
      {
        id: 'dev-gsm-001',
        name: 'Capteur Terrain',
        type: 'gsm',
        protocol: 'HTTPS',
        lastSeen: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        status: 'offline',
        signalStrength: 45,
        firmwareVersion: '0.9.5'
      },
      {
        id: 'dev-uhf-001',
        name: 'Balise UHF',
        type: 'uhf',
        protocol: 'LoRa',
        lastSeen: new Date(),
        status: 'online',
        signalStrength: 72,
        firmwareVersion: '2.1.0'
      }
    ];

    mockDevices.forEach(device => this.devices.set(device.id, device));
  }

  private simulateDeviceActivity(): void {
    // Simulate device status changes
    setInterval(() => {
      this.devices.forEach(device => {
        // Randomly change status (5% chance)
        if (Math.random() < 0.05) {
          const statuses: DeviceStatus[] = ['online', 'offline', 'error'];
          const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
          
          this.devices.set(device.id, {
            ...device,
            status: newStatus,
            lastSeen: new Date(),
            signalStrength: Math.max(0, Math.min(100, (device.signalStrength || 0) + (Math.random() * 20 - 10)))
          });
          
          this.emit('deviceUpdate', this.devices.get(device.id));
        }
      });
    }, 10000); // Check every 10 seconds
  }

  public async listDevices(): Promise<Device[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
    return Array.from(this.devices.values());
  }

  public async getDeviceById(id: string): Promise<Device | undefined> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.devices.get(id);
  }

  public async sendCommand(deviceId: string, command: string, params: Record<string, any> = {}): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Simulate command execution
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    // 90% success rate for demo purposes
    const success = Math.random() > 0.1;
    
    if (!success) {
      throw new Error(`Failed to execute command ${command} on device ${deviceId}`);
    }

    // Update device status after command
    this.devices.set(deviceId, {
      ...device,
      lastSeen: new Date()
    });
    
    this.emit('commandExecuted', { deviceId, command, params, success });
    return success;
  }

  public on(event: string, callback: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const listeners = this.eventListeners.get(event)!;
    listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    };
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  public getConnectionStatus() {
    return this.connectionStatus;
  }

  public async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') {
      return;
    }

    this.connectionStatus = 'connected';
    this.reconnectAttempts = 0;
    this.emit('connectionChange', { status: this.connectionStatus });
  }

  public disconnect(): void {
    this.connectionStatus = 'disconnected';
    this.emit('connectionChange', { status: this.connectionStatus });
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.connectionStatus = 'error';
      this.emit('connectionError', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * this.reconnectAttempts;
    
    setTimeout(() => {
      if (this.connectionStatus === 'disconnected') {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
          this.handleDisconnect();
        });
      }
    }, delay);
  }
}

export const remoteLinkManager = RemoteLinkManager.getInstance();

// For backward compatibility
export default {
  listDevices: () => remoteLinkManager.listDevices(),
  getDeviceById: (id: string) => remoteLinkManager.getDeviceById(id),
  sendCommand: (deviceId: string, command: string, params?: any) => 
    remoteLinkManager.sendCommand(deviceId, command, params),
  on: (event: string, callback: Function) => remoteLinkManager.on(event, callback),
  connect: () => remoteLinkManager.connect(),
  disconnect: () => remoteLinkManager.disconnect(),
  getConnectionStatus: () => remoteLinkManager.getConnectionStatus()
};
