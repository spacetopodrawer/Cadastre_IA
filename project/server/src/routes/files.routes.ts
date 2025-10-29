import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { prepared } from '../database/db';
import { authMiddleware } from '../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';

const router = Router();

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: any, destination: string) => void) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: any, filename: string) => void) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    cb(null, true);
  }
});

router.use(authMiddleware);

router.post('/upload', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileId = uuidv4();
    const userId = (req as any).user.userId;

    prepared.createFile.run(
      fileId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      userId
    );

    const versionId = uuidv4();
    prepared.createFileVersion.run(
      versionId,
      fileId,
      1,
      req.file.path,
      userId,
      'Version initiale'
    );

    res.status(201).json({
      message: 'Fichier uploadé avec succès',
      file: {
        id: fileId,
        name: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const files = prepared.getFilesByOwner.all(userId);
    res.json({ files });
  } catch (error) {
    console.error('Erreur liste fichiers:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des fichiers' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const file: any = prepared.getFileById.get(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    const userId = (req as any).user.userId;
    if (file.owner_id !== userId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    res.json({ file });
  } catch (error) {
    console.error('Erreur détails fichier:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du fichier' });
  }
});

router.get('/:id/versions', (req: Request, res: Response) => {
  try {
    const versions = prepared.getFileVersions.all(req.params.id);
    res.json({ versions });
  } catch (error) {
    console.error('Erreur versions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des versions' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const file: any = prepared.getFileById.get(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    const userId = (req as any).user.userId;
    if (file.owner_id !== userId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    const stmt = (prepared as any).db.prepare('DELETE FROM files WHERE id = ?');
    stmt.run(req.params.id);

    res.json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

export default router;
