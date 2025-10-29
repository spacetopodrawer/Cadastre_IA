import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { adminRoutes } from './routes/admin.routes';
import { deviceRoutes } from './routes/device.routes';
import { auditRoutes } from './routes/audit.routes';
import { errorHandler } from './middleware/errorHandler.middleware';
import { authenticateJWT } from './middleware/auth.middleware';

// Charger les variables d'environnement
dotenv.config();

// Création de l'application Express
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configuration CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// En-têtes de sécurité
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Middleware d'authentification (sauf pour les routes publiques)
app.use((req, res, next) => {
  // Liste des routes publiques qui ne nécessitent pas d'authentification
  const publicRoutes = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh-token'
  ];

  if (publicRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }
  
  // En développement, on peut désactiver l'authentification
  if (NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
    // Simuler un utilisateur admin pour le développement
    req.user = {
      userId: 'dev-user-id',
      userName: 'Développeur',
      userRole: 'ADMIN',
      permissions: ['*']
    };
    return next();
  }

  // Utiliser le vrai middleware d'authentification
  return authenticateJWT(req, res, next);
});

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes API
app.use('/api/admin', adminRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/audit', auditRoutes);

// Route de base
app.get('/', (req, res) => {
  res.json({
    name: 'API Cadastre IA',
    version: '1.0.0',
    status: 'en cours d\'exécution',
    environment: NODE_ENV,
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

// Création du serveur HTTP
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${NODE_ENV}`);
  console.log(`📅 ${new Date().toLocaleString()}`);
  
  if (NODE_ENV === 'development') {
    console.log('\n🔗 URLs:');
    console.log(`   - Local:   http://localhost:${PORT}`);
    console.log(`   - Network: http://${require('os').networkInterfaces().eth0?.[0]?.address || 'localhost'}:${PORT}`);
  }
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('\n❌ Exception non capturée:', error);
  // Ici, vous pourriez ajouter une journalisation supplémentaire
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n⚠️  Rejet de promesse non géré détecté:');
  console.error('   - Raison:', reason);
  console.error('   - Promesse rejetée:', promise);
  // Ici, vous pourriez ajouter une journalisation supplémentaire
});

// Gestion des avertissements
process.on('warning', (warning) => {
  console.warn('\n⚠️  Avertissement Node.js:');
  console.warn(warning);
});

// Gestion propre des arrêts
const shutdown = () => {
  console.log('\n🛑 Arrêt du serveur en cours...');
  
  // Fermer le serveur
  server.close(() => {
    console.log('✅ Serveur arrêté');
    
    // Ici, vous pourriez ajouter la fermeture d'autres connexions
    // par exemple, la base de données, les files d'attente, etc.
    
    process.exit(0);
  });

  // Forcer l'arrêt après 5 secondes si nécessaire
  setTimeout(() => {
    console.error('❌ Arrêt forcé du serveur');
    process.exit(1);
  }, 5000);
};

// Gestion des signaux d'arrêt
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
    // Simuler un utilisateur admin pour les tests
    req.user = { id: 'test-admin', role: 'ADMIN' };
  }
  next();
});

// Routes de base
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Cadastre_IA en cours d\'exécution',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Routes d'administration
app.use('/api/admin', adminRoutes);

// Gestion des erreurs
app.use(errorHandler);

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Démarrer le serveur
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur en cours d'exécution sur le port ${PORT}`);
  console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejet non géré détecté:', reason);
  // Loguer l'erreur ou effectuer d'autres actions de nettoyage
});

// Gestion de l'arrêt propre du serveur
const shutdown = () => {
  console.log('\nArrêt du serveur en cours...');
  server.close(() => {
    console.log('Serveur arrêté avec succès');
    process.exit(0);
  });

  // Forcer l'arrêt après 5 secondes si nécessaire
  setTimeout(() => {
    console.error('Forçage de l\'arrêt du serveur...');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
