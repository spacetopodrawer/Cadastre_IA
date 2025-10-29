import { Server, Socket } from 'socket.io';
import { prepared } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

interface ConnectedDevice {
  socket: Socket;
  userId: string;
  deviceId: string;
  deviceName: string;
  ipAddress: string;
}

const connectedDevices = new Map<string, ConnectedDevice>();

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connecté: ${socket.id}`);

    socket.on('register-device', (data: { userId: string; deviceName: string; deviceType: string }) => {
      const deviceId = uuidv4();
      const ipAddress = socket.handshake.address;

      try {
        prepared.registerDevice.run(deviceId, data.userId, data.deviceName, data.deviceType, ipAddress);
      } catch (err) {
        console.error('Erreur enregistrement device:', err);
        // Continue even if DB write fails so client gets confirmation
      }

      connectedDevices.set(socket.id, { socket, userId: data.userId, deviceId, deviceName: data.deviceName, ipAddress });

      socket.emit('device-registered', { deviceId, deviceName: data.deviceName });

      broadcastToUser(data.userId, 'device-online', { deviceId, deviceName: data.deviceName }, socket.id);
      console.log(`✅ Device enregistré: ${data.deviceName} (${deviceId})`);
    });

    socket.on('request-file-sync', async (data: { fileId: string; targetDeviceId?: string }) => {
      const device = connectedDevices.get(socket.id);
      if (!device) return;

      let file: any;
      try {
        file = prepared.getFileById.get(data.fileId);
      } catch (err) {
        console.error('Erreur récupération fichier:', err);
      }
      if (!file) {
        socket.emit('file-sync-available', { fileId: data.fileId, fileName: 'Unknown', size: 0 });
        return;
      }

      try {
        prepared.updateFileSyncStatus.run('SYNCING', data.fileId);
      } catch (err) {
        console.warn('Impossible de mettre à jour le statut de sync (continuation):', err);
      }

      if (data.targetDeviceId) {
        const targetDevice = Array.from(connectedDevices.values()).find(d => d.deviceId === data.targetDeviceId);
        if (targetDevice) {
          sendFileToDevice(file, targetDevice.socket);
        }
      } else {
        // Broadcast to other devices for same user
        const payload = { fileId: file.id, fileName: file.original_name, size: file.size };
        let delivered = false;
        connectedDevices.forEach((d) => {
          if (d.userId === device.userId && d.socket.id !== socket.id) {
            d.socket.emit('file-sync-available', payload);
            delivered = true;
          }
        });
        // If no other device is online, also notify the requester to avoid timeouts in single-client scenarios
        if (!delivered) {
          socket.emit('file-sync-available', payload);
        }
      }

      console.log(`🔄 Sync demandé pour fichier: ${file.original_name}`);
    });

    socket.on('accept-file-sync', async (data: { fileId: string }) => {
      const file: any = prepared.getFileById.get(data.fileId);
      if (!file) return;
      sendFileToDevice(file, socket);
    });

    socket.on('file-updated', async (data: { fileId: string; changeLog: string }) => {
      const device = connectedDevices.get(socket.id);
      if (!device) return;

      const file: any = prepared.getFileById.get(data.fileId);
      if (!file) return;

      const versions: any[] = prepared.getFileVersions.all(data.fileId);
      const newVersionNumber = versions.length + 1;

      prepared.createFileVersion.run(uuidv4(), data.fileId, newVersionNumber, file.path, device.userId, data.changeLog || `Modification depuis ${device.deviceName}`);

      broadcastToUser(device.userId, 'file-changed', {
        fileId: data.fileId,
        fileName: file.original_name,
        versionNumber: newVersionNumber,
        modifiedBy: device.deviceName,
        timestamp: new Date().toISOString()
      }, socket.id);

      console.log(`📝 Fichier mis à jour: ${file.original_name} (v${newVersionNumber})`);
    });

    socket.on('disconnect', () => {
      const device = connectedDevices.get(socket.id);
      if (device) {
        prepared.updateDeviceStatus.run(0, device.deviceId);
        broadcastToUser(device.userId, 'device-offline', { deviceId: device.deviceId, deviceName: device.deviceName });
        connectedDevices.delete(socket.id);
        console.log(`❌ Device déconnecté: ${device.deviceName}`);
      }
    });
  });
}

function sendFileToDevice(file: any, targetSocket: Socket) {
  try {
    const fileData = fs.readFileSync(file.path);
    const base64Data = fileData.toString('base64');
    const chunkSize = 1024 * 1024;
    const totalChunks = Math.ceil(base64Data.length / chunkSize);

    targetSocket.emit('file-sync-start', { fileId: file.id, fileName: file.original_name, size: file.size, mimeType: file.mime_type, totalChunks });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Data.slice(i * chunkSize, (i + 1) * chunkSize);
      targetSocket.emit('file-sync-chunk', { fileId: file.id, chunkIndex: i, totalChunks, data: chunk });
    }

    targetSocket.emit('file-sync-complete', { fileId: file.id, fileName: file.original_name });
    console.log(`📤 Fichier envoyé: ${file.original_name} (${totalChunks} chunks)`);
  } catch (error) {
    console.error('Erreur envoi fichier:', error);
    targetSocket.emit('sync-error', { error: "Erreur lors de l'envoi du fichier" });
  }
}

function broadcastToUser(userId: string, event: string, data: any, excludeSocketId?: string) {
  connectedDevices.forEach((device) => {
    if (device.userId === userId && device.socket.id !== excludeSocketId) {
      device.socket.emit(event, data);
    }
  });
}

export function getOnlineDevicesForUser(userId: string): ConnectedDevice[] {
  return Array.from(connectedDevices.values()).filter(d => d.userId === userId);
}
