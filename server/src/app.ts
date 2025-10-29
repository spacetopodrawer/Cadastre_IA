import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import deviceRoutes from './routes/device.routes';
import auditRoutes from './routes/audit.routes';
import { errorHandler } from './middleware/error.middleware';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// En-têtes de sécurité
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Routes API
app.use('/api/devices', deviceRoutes);
app.use('/api/audit', auditRoutes);

// Route de base
app.get('/', (req, res) => {
  res.json({
    name: 'API Cadastre IA',
    version: '1.0.0',
    status: 'en cours d\'exécution',
    documentation: '/api-docs' // À implémenter avec Swagger/OpenAPI
  });
});

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ressource non trouvée',
    path: req.originalUrl
  });
});

// Gestion des erreurs globale
app.use(errorHandler);

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejet non géré détecté:', reason);
  // Ici, vous pourriez ajouter une journalisation supplémentaire
});

process.on('uncaughtException', (error) => {
  console.error('Exception non capturée détectée:', error);
  // Ici, vous pourriez ajouter une journalisation supplémentaire
  process.exit(1); // Le processus doit être redémarré
});

// Démarrer le serveur
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'développement'}`);
});

// Gestion propre des arrêts
const shutdown = () => {
  console.log('Arrêt du serveur en cours...');
  server.close(() => {
    console.log('Serveur arrêté');
    process.exit(0);
  });

  // Forcer l'arrêt après 5 secondes si nécessaire
  setTimeout(() => {
    console.error('Arrêt forcé du serveur');
    process.exit(1);
  }, 5000);
};

// Gestion des signaux d'arrêt
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server }; // Pour les tests
