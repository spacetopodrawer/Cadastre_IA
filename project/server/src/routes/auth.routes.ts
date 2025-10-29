import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prepared } from '../database/db';

const router = Router();

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    const existingUser = prepared.getUserByEmail.get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    prepared.createUser.run(userId, email, hashedPassword, name, 'USER', null);

    const user: User = { id: userId, email, name, role: 'USER' };
    const token = generateToken(user);

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token,
      user
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user: any = prepared.getUserByEmail.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role });

    res.json({
      message: 'Connexion réussie',
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

router.get('/me', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    const user: any = prepared.getUserById.get(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

router.post('/create-admin', async (req, res) => {
  try {
    const topLevelSecret = (req.body && req.body.secretKey) || undefined;

    const payloads: Array<{ email: string; password: string; name: string; secretKey?: string }> = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.admins)
        ? req.body.admins
        : [{ email: req.body.email, password: req.body.password, name: req.body.name, secretKey: req.body.secretKey }];

    const results: any[] = [];

    for (const p of payloads) {
      const secretKey = p.secretKey || topLevelSecret;
      if (secretKey !== 'CADASTRE_IA_INIT_2024') {
        results.push({ email: p.email, status: 'skipped', reason: 'Clé secrète invalide' });
        continue;
      }

      try {
        const existing = prepared.getUserByEmail.get(p.email);
        if (existing) {
          results.push({ email: p.email, status: 'exists' });
          continue;
        }

        const hashedPassword = await bcrypt.hash(p.password, 10);
        const userId = uuidv4();
        prepared.createUser.run(userId, p.email, hashedPassword, p.name, 'SUPER_ADMIN', null);
        results.push({ email: p.email, status: 'created', user: { id: userId, email: p.email, name: p.name, role: 'SUPER_ADMIN' } });
      } catch (err) {
        console.error('Erreur création admin (unitaire):', err);
        results.push({ email: p.email, status: 'error', reason: 'Exception lors de la création' });
      }
    }

    const createdCount = results.filter(r => r.status === 'created').length;
    const hasAnyCreated = createdCount > 0;
    return res.status(hasAnyCreated ? 201 : 200).json({ message: 'Traitement création super admins terminé', results });
  } catch (error) {
    console.error('Erreur création admin:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'admin' });
  }
});

export default router;
