import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { prepared } from '../database/db';
import { getOnlineDevicesForUser } from '../services/socketService';

const router = Router();

router.use(authMiddleware);

router.get('/devices', (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const devices: any[] = prepared.getOnlineDevices.all(userId);
    res.json({ devices });
  } catch (error) {
    console.error('Erreur récupération devices:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des devices' });
  }
});

router.get('/status', (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const stmt = (prepared as any).db.prepare(`
      SELECT 
        COUNT(*) as total_files,
        SUM(CASE WHEN sync_status = 'SYNCED' THEN 1 ELSE 0 END) as synced_files,
        SUM(CASE WHEN sync_status = 'PENDING' THEN 1 ELSE 0 END) as pending_files,
        SUM(CASE WHEN sync_status = 'CONFLICT' THEN 1 ELSE 0 END) as conflict_files
      FROM files
      WHERE owner_id = ?
    `);
    const stats = stmt.get(userId);
    const onlineDevices = getOnlineDevicesForUser(userId);

    res.json({
      stats,
      onlineDevices: onlineDevices.map(d => ({ deviceId: d.deviceId, deviceName: d.deviceName, ipAddress: d.ipAddress }))
    });
  } catch (error) {
    console.error('Erreur statut sync:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut' });
  }
});

router.post('/queue', (req, res) => {
  try {
    const { fileId, targetDeviceId } = req.body;
    const userId = (req as any).user.userId;

    const file: any = prepared.getFileById.get(fileId);
    if (!file || file.owner_id !== userId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const queueId = require('uuid').v4();
    const sourceDeviceId = req.body.sourceDeviceId || 'server';

    prepared.addToSyncQueue.run(queueId, fileId, sourceDeviceId, targetDeviceId || null);

    res.json({ message: 'Fichier ajouté à la queue de synchronisation', queueId });
  } catch (error) {
    console.error('Erreur ajout queue:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout à la queue' });
  }
});

router.get('/pending', (req, res) => {
  try {
    const pendingSyncs = prepared.getPendingSyncs.all();
    res.json({ pendingSyncs });
  } catch (error) {
    console.error('Erreur syncs pending:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des syncs' });
  }
});

export default router;
