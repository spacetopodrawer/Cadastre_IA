# Cadastre_IA - MVP Phase 1

Application web collaborative de dessin avec gestion de fichiers, authentification multi-niveaux et versioning.

## Fonctionnalités

### Éditeur Paint
- Outils de dessin : crayon, gomme, formes géométriques (cercle, rectangle, ligne)
- Ajout de texte
- Sélecteur de couleurs avec palette prédéfinie
- Taille de pinceau ajustable (1-50px)
- Historique d'actions (Annuler/Rétablir)
- Sauvegarde automatique avec versioning
- Export de miniatures

### Gestion de Fichiers
- Création, lecture, mise à jour et suppression de dessins
- Liste visuelle avec miniatures
- Informations de dernière modification
- Accès rapide aux fichiers

### Authentification & Rôles
- Inscription/Connexion par email/mot de passe
- Système de rôles hiérarchiques :
  - **USER** : Utilisateur standard (création et gestion de ses propres fichiers)
  - **ADMIN** : Administrateur (accès au panneau admin, lecture de tous les fichiers)
  - **SUPER_ADMIN** : Super administrateur (modification des rôles utilisateurs)

### Panneau d'Administration
- Statistiques : nombre d'utilisateurs, fichiers, admins
- Liste de tous les utilisateurs
- Modification des rôles (SUPER_ADMIN uniquement)
- Vue d'ensemble de l'activité

## Stack Technique

- **Frontend** : React 18 + TypeScript + Tailwind CSS
- **État** : Zustand (state management)
- **Routing** : React Router v6
- **Canvas** : Fabric.js
- **Backend** : Supabase (BaaS)
  - PostgreSQL avec Row Level Security (RLS)
  - Authentification JWT
  - Stockage de données temps réel

## Architecture de la Base de Données

### Tables

1. **profiles** : Profils utilisateurs étendant auth.users
   - Informations : nom complet, rôle, dates
   - Trigger automatique à la création d'utilisateur

2. **files** : Métadonnées et contenu des dessins
   - Contenu canvas au format JSON (Fabric.js)
   - Miniatures en Data URL
   - Partage et propriété

3. **file_versions** : Historique des versions
   - Suivi de toutes les modifications
   - Log des changements
   - Identification de l'auteur

4. **file_permissions** : Permissions de partage
   - Niveaux : READ, WRITE, ADMIN
   - Traçabilité des attributions

### Sécurité (RLS)

Toutes les tables sont protégées par Row Level Security :
- Les utilisateurs ne peuvent accéder qu'à leurs propres données
- Les administrateurs ont accès étendu selon leur rôle
- Les permissions de partage sont respectées
- Aucune escalade de privilèges possible

## Installation & Déploiement

### Prérequis
- Node.js 18+
- npm ou yarn
- Compte Supabase

### Configuration

1. Les variables d'environnement sont déjà configurées dans `.env`

2. La base de données est déjà initialisée avec :
   - Schéma complet (tables, indexes, triggers)
   - Politiques RLS actives
   - Fonctions automatiques

### Développement Local

```bash
# Installer les dépendances (déjà fait)
npm install

# Démarrer le serveur de développement
npm run dev

# L'application sera accessible sur http://localhost:5173
```

### Production

```bash
# Build de production
npm run build

# Les fichiers statiques seront dans /dist
# Déployable sur n'importe quel hébergeur statique :
# - Vercel
# - Netlify
# - AWS S3 + CloudFront
# - Firebase Hosting
```

## Utilisation

### Premier Démarrage

1. **Créer un compte** : Utilisez le formulaire d'inscription
   - Le premier utilisateur peut être promu SUPER_ADMIN manuellement via Supabase

2. **Se connecter** : Email + mot de passe

3. **Créer un dessin** :
   - Cliquez sur "Nouveau dessin"
   - Donnez un nom à votre fichier
   - Commencez à dessiner !

4. **Sauvegarder** :
   - Cliquez sur "Sauvegarder" pour créer une version
   - Les versions sont automatiquement tracées

### Administration

Pour accéder au panneau admin, votre rôle doit être ADMIN ou SUPER_ADMIN.

**Promouvoir le premier SUPER_ADMIN** (via Supabase Dashboard) :
```sql
UPDATE profiles
SET role = 'SUPER_ADMIN'
WHERE id = 'user-id-here';
```

## Structure du Projet

```
src/
├── components/
│   ├── Auth/           # Authentification
│   ├── Admin/          # Panneau administration
│   ├── FileManager/    # Gestion fichiers
│   ├── PaintEditor/    # Éditeur de dessin
│   └── Layout/         # Layout principal
├── stores/
│   ├── authStore.ts    # État authentification
│   └── fileStore.ts    # État fichiers
├── lib/
│   ├── supabase.ts     # Client Supabase
│   └── database.types.ts # Types TypeScript
└── App.tsx             # Point d'entrée
```

## Prochaines Phases

### Phase 2 - Collaboration (2-3 semaines)
- Partage de fichiers entre utilisateurs
- Permissions granulaires
- Synchronisation manuelle

### Phase 3 - Temps Réel (3-4 semaines)
- Édition collaborative en temps réel (WebRTC)
- Synchronisation automatique quotidienne
- Résolution de conflits intelligente
- Notifications push

### Phase 4 - Multi-plateforme (4-6 semaines)
- Application Desktop (Electron)
- Application Mobile (Capacitor)
- Synchronisation cross-platform

## Support & Contact

Pour toute question ou problème :
- Vérifiez les logs dans la console du navigateur
- Consultez les logs Supabase (Dashboard > Logs)
- Vérifiez les politiques RLS si problème de permissions

## Licence

MIT

## ⚡ Installation Rapide

### Linux/Mac
```bash
chmod +x setup.sh
./setup.sh
```

### Windows
```batch
setup.bat
```

### Manuel
```bash
# Copier les fichiers d'exemple
cp .env.example .env
cp server/.env.example server/.env

# Éditer les fichiers selon votre configuration
# .env => VITE_API_URL=http://localhost:5000
# server/.env => JWT_SECRET=(secret aléatoire sécurisé)
