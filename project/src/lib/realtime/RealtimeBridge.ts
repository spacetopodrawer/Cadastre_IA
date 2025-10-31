import { v4 as uuidv4 } from 'uuid';
import { FusionAuditLog } from '../audit/FusionAuditLog';

export type RealtimeEventType = 'validation' | 'suggestion' | 'correction' | 'notification' | 'export' | 'lock' | 'sync';

export interface RealtimeEvent<T = any> {
  id: string;
  type: RealtimeEventType;
  payload: T;
  timestamp: number;
  userId?: string;
  missionId: string;
  sessionId?: string;
  metadata?: {
    deviceId?: string;
    coordinates?: [number, number];
    version?: string;
  };
}

type Subscription = {
  id: string;
  missionId: string;
  userId: string;
  eventTypes?: RealtimeEventType[];
  onEvent: (event: RealtimeEvent) => void;
};

type PendingEvent = RealtimeEvent & { attempts: number };

export class RealtimeBridge {
  private static instance: RealtimeBridge;
  private socket: WebSocket | null = null;
  private subscriptions: Subscription[] = [];
  private pendingEvents: PendingEvent[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private isConnected = false;
  private sessionId = uuidv4();
  private deviceId = this.getOrCreateDeviceId();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupPersistence();
  }

  public static getInstance(): RealtimeBridge {
    if (!RealtimeBridge.instance) {
      RealtimeBridge.instance = new RealtimeBridge();
    }
    return RealtimeBridge.instance;
  }

  public async connect(url: string, authToken?: string): Promise<void> {
    if (this.socket) {
      this.disconnect();
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = new URL(url);
        if (authToken) {
          wsUrl.searchParams.append('token', authToken);
        }
        wsUrl.searchParams.append('sessionId', this.sessionId);
        wsUrl.searchParams.append('deviceId', this.deviceId);

        this.socket = new WebSocket(wsUrl.toString());

        this.socket.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushPendingEvents();
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleIncomingMessage(message);
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };

        this.socket.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this.stopHeartbeat();
          this.attemptReconnect();
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        reject(error);
      }
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.stopHeartbeat();
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  public subscribe(
    missionId: string,
    userId: string,
    onEvent: (event: RealtimeEvent) => void,
    eventTypes?: RealtimeEventType[]
  ): string {
    const subscriptionId = uuidv4();
    this.subscriptions.push({
      id: subscriptionId,
      missionId,
      userId,
      eventTypes,
      onEvent,
    });
    return subscriptionId;
  }

  public unsubscribe(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter(sub => sub.id !== subscriptionId);
  }

  public async broadcast<T = any>(
    type: RealtimeEventType,
    payload: T,
    missionId: string,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const event: RealtimeEvent<T> = {
      id: uuidv4(),
      type,
      payload,
      timestamp: Date.now(),
      userId,
      missionId,
      sessionId: this.sessionId,
      metadata: {
        deviceId: this.deviceId,
        ...metadata,
      },
    };

    // Log the event for audit
    await FusionAuditLog.getInstance().logEvent({
      type,
      userId: userId || 'system',
      entityType: 'realtime',
      entityId: event.id,
      metadata: {
        missionId,
        payloadType: typeof payload,
        ...metadata,
      },
    });

    this.sendEvent(event);
  }

  public notify(
    userId: string,
    message: string,
    missionId: string,
    type: 'info' | 'warning' | 'error' | 'success' = 'info'
  ): void {
    this.broadcast('notification', { message, type }, missionId, userId);
  }

  public lockFeature(
    featureId: string,
    missionId: string,
    userId: string,
    coordinates?: [number, number]
  ): void {
    this.broadcast(
      'lock',
      { featureId, action: 'lock' },
      missionId,
      userId,
      { coordinates }
    );
  }

  public unlockFeature(
    featureId: string,
    missionId: string,
    userId: string
  ): void {
    this.broadcast(
      'lock',
      { featureId, action: 'unlock' },
      missionId,
      userId
    );
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  private sendEvent(event: RealtimeEvent): void {
    if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(event));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        this.queueEventForRetry({ ...event, attempts: 0 });
      }
    } else {
      this.queueEventForRetry({ ...event, attempts: 0 });
    }
  }

  private queueEventForRetry(event: PendingEvent): void {
    if (event.attempts < 3) {
      this.pendingEvents.push({
        ...event,
        attempts: event.attempts + 1,
      });
      this.savePendingEvents();
    }
  }

  private flushPendingEvents(): void {
    if (!this.isConnected) return;

    const failedEvents: PendingEvent[] = [];
    
    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift();
      if (event) {
        try {
          this.sendEvent(event);
        } catch (error) {
          console.error('Failed to resend pending event:', error);
          failedEvents.push(event);
        }
      }
    }

    if (failedEvents.length > 0) {
      this.pendingEvents = [...failedEvents, ...this.pendingEvents];
      this.savePendingEvents();
    } else {
      this.clearPendingEvents();
    }
  }

  private handleIncomingMessage(message: any): void {
    try {
      const event = message as RealtimeEvent;
      
      // Handle heartbeat response
      if (event.type === 'heartbeat') {
        return;
      }

      // Log the incoming event
      FusionAuditLog.getInstance().logEvent({
        type: event.type,
        userId: event.userId || 'unknown',
        entityType: 'realtime',
        entityId: event.id,
        metadata: {
          missionId: event.missionId,
          sessionId: event.sessionId,
          deviceId: event.metadata?.deviceId,
        },
      });

      // Dispatch to subscribers
      this.subscriptions.forEach(subscription => {
        if (
          subscription.missionId === event.missionId &&
          (!subscription.eventTypes || subscription.eventTypes.includes(event.type))
        ) {
          try {
            subscription.onEvent(event);
          } catch (error) {
            console.error('Error in subscription handler:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.socket?.url) {
        this.connect(this.socket.url)
          .catch(error => {
            console.error('Reconnection attempt failed:', error);
            this.attemptReconnect();
          });
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: Date.now(),
            sessionId: this.sessionId,
            deviceId: this.deviceId,
          }));
        } catch (error) {
          console.error('Heartbeat failed:', error);
          this.attemptReconnect();
        }
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `device-${uuidv4()}`;
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  private setupPersistence(): void {
    // Load pending events from storage
    const savedEvents = localStorage.getItem('pendingRealtimeEvents');
    if (savedEvents) {
      try {
        const events = JSON.parse(savedEvents);
        if (Array.isArray(events)) {
          this.pendingEvents = events;
        }
      } catch (error) {
        console.error('Failed to load pending events:', error);
      }
    }

    // Save pending events on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.savePendingEvents();
      });
    }
  }

  private savePendingEvents(): void {
    try {
      localStorage.setItem(
        'pendingRealtimeEvents',
        JSON.stringify(this.pendingEvents)
      );
    } catch (error) {
      console.error('Failed to save pending events:', error);
    }
  }

  private clearPendingEvents(): void {
    this.pendingEvents = [];
    localStorage.removeItem('pendingRealtimeEvents');
  }
}

export const realtimeBridge = RealtimeBridge.getInstance();
