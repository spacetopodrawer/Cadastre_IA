# 🏛️ API Cadastre IA

API serveur pour la gestion des rôles et des appareils dans l'application Cadastre IA.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-blue.svg)](https://www.typescriptlang.org/)
[![GitHub last commit](https://img.shields.io/github/last-commit/spacetopodrawer/cadastre-ia)](https://github.com/spacetopodrawer/cadastre-ia/commits/main)

## 👤 Auteur

**EBOLO ETINGUE Wilfried** (spacetopodrawer)  
[![GitHub](https://img.shields.io/badge/GitHub-spacetopodrawer-181717?style=for-the-badge&logo=github)](https://github.com/spacetopodrawer)

## 🚀 Fonctionnalités

- 🔐 Gestion des rôles et permissions
- 📱 Gestion des appareils et approbation
- 📝 Journalisation des actions (audit log)
- 🔑 Authentification JWT
- 🛡️ Sécurité renforcée (CORS, en-têtes de sécurité)
- 🧪 Tests automatisés avec couverture de code
- 🛠️ Configuration TypeScript prête pour la production

## 📋 Prérequis

- Node.js 18+
- npm 9+ ou pnpm 8+
- PostgreSQL 14+ (ou autre base de données compatible avec Knex)
- Git

## 🛠️ Installation

1. Cloner le dépôt :
   ```bash
   git clone https://github.com/spacetopodrawer/cadastre-ia.git
   cd cadastre-ia/server
   ```

2. Installer les dépendances :
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement :
   ```bash
   cp .env.example .env
   # Éditer le fichier .env selon votre configuration
   ```

4. Configurer la base de données :
   ```bash
   # Créer la base de données
   createdb cadastre_ia
   
   # Exécuter les migrations
   npm run migrate
   ```

## Démarrage

En mode développement :
```bash
npm run dev
```

En production :
```bash
npm run build
npm start
```

## Variables d'environnement

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
# Configuration du serveur
PORT=5000
NODE_ENV=development

# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cadastre_ia
DB_USER=postgres
DB_PASSWORD=postgres

# JWT
JWT_SECRET=votre_clé_secrète_très_longue_et_sécurisée
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# CORS
FRONTEND_URL=http://localhost:5173

# Logging
LOG_LEVEL=info

# Sécurité
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX=100  # 100 requêtes par fenêtre
```

## Structure du projet

```
src/
├── config/           # Fichiers de configuration
├── controllers/      # Contrôleurs
├── middleware/       # Middleware Express
├── migrations/       # Migrations de base de données
├── models/           # Modèles de données
├── routes/           # Définition des routes
├── services/         # Logique métier
├── types/            # Définitions de types TypeScript
├── utils/            # Utilitaires
├── app.ts           # Configuration de l'application
└── index.ts         # Point d'entrée
```

## API Documentation

La documentation de l'API est disponible à l'adresse `/api-docs` lorsque le serveur est en cours d'exécution.

## Tests

Pour exécuter les tests :

```bash
# Exécuter tous les tests
npm test

# Exécuter les tests en mode watch
npm run test:watch

# Générer un rapport de couverture
npm run test:coverage
```

## Linting et formatage

```bash
# Vérifier le style de code
npm run lint

# Corriger automatiquement les problèmes de style
npm run lint:fix

# Formater le code
npm run format
```

## Déploiement

### Préparation pour la production

1. Construire l'application :
   ```bash
   npm run build
   ```

2. Configurer les variables d'environnement en production.

3. Démarrer le serveur :
   ```bash
   npm start
   ```

### Avec PM2 (recommandé pour la production)

```bash
# Installation globale de PM2
npm install -g pm2

# Démarrer l'application avec PM2
pm2 start dist/index.js --name "cadastre-ia-api"

# Configurer le démarrage automatique au redémarrage
pm2 startup
pm2 save
```

## Sécurité

- Toutes les routes (sauf `/api/health`) nécessitent une authentification JWT valide.
- Les mots de passe sont hachés avec bcrypt avant d'être stockés en base de données.
- Les clés JWT sont signées avec un secret fort et ont une durée de vie limitée.
- Les en-têtes de sécurité HTTP sont configurés pour protéger contre les attaques courantes.
- Le taux de requêtes est limité pour prévenir les attaques par force brute.

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
