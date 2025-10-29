import { io, Socket } from 'socket.io-client';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000';

class SocketManager {
  private socket: Socket | null = null;
  private deviceId: string | null = null;

  connect(userId: string, deviceName: string) {
    if (this.socket?.connected) return this.socket;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.socket!.emit('register-device', {
        userId,
        deviceName,
        deviceType: this.getDeviceType()
      });
    });

    this.socket.on('device-registered', (data) => {
      this.deviceId = data.deviceId;
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.deviceId = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  requestFileSync(fileId: string, targetDeviceId?: string) {
    if (!this.socket) return;
    this.socket.emit('request-file-sync', { fileId, targetDeviceId });
  }

  acceptFileSync(fileId: string) {
    if (!this.socket) return;
    this.socket.emit('accept-file-sync', { fileId });
  }

  notifyFileUpdate(fileId: string, changeLog?: string) {
    if (!this.socket) return;
    this.socket.emit('file-updated', { fileId, changeLog });
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (!this.socket) return;
    this.socket.off(event, callback as any);
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'MOBILE';
    if (/tablet/i.test(ua)) return 'TABLET';
    return 'PC';
  }
}

export const socketManager = new SocketManager();
