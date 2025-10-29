# Guide de Déploiement - Système de Rôles Cadastre_IA

Ce document fournit les instructions pour déployer et configurer le système de rôles de Cadastre_IA.

## Prérequis

- Node.js 16+ et npm 8+
- Base de données (MongoDB/PostgreSQL) configurée
- Variables d'environnement configurées (voir `.env.example`)

## Installation

1. **Cloner le dépôt**
   ```bash
   git clone https://github.com/votre-org/cadastre-ia.git
   cd cadastre-ia
   ```

2. **Installer les dépendances**
   ```bash
   cd server
   npm install
   ```

3. **Configurer l'environnement**
   ```bash
   cp .env.example .env
   # Éditer le fichier .env avec vos configurations
   ```

## Configuration Initiale

### Création du Premier SUPER_ADMIN

1. **Méthode 1 : Via l'API**
   ```bash
   curl -X POST http://localhost:5000/api/admin/users \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@example.com",
       "password": "MotDePasseTresSecure123!",
       "role": "SUPER_ADMIN"
     }'
   ```

2. **Méthode 2 : Via la base de données**
   ```sql
   -- Exemple pour PostgreSQL
   INSERT INTO users (email, password_hash, role, is_active, created_at)
   VALUES (
     'admin@example.com',
     -- Le hash doit être généré avec bcrypt (coût 10)
     '$2b$10$VXpf9E9zJ7q3XqQ1z8XZ.ev1JZJ5Qp8XJz8XZ.ev1JZJ5Qp8XJz8X',
     'SUPER_ADMIN',
     true,
     NOW()
   );
   ```

### Configuration des Rôles par Défaut

Les rôles sont définis dans `server/src/config/roles.config.ts`. Pour les modifier :

1. Mettez à jour la constante `ROLE_PROFILES`
2. Redémarrez le serveur
3. Exécutez les migrations si nécessaire

## Déploiement

### Environnement de Développement

```bash
# Démarrer le serveur en mode développement
npm run dev

# Lancer les tests
npm test
```

### Environnement de Production

1. **Construire l'application**
   ```bash
   npm run build
   ```

2. **Démarrer le serveur**
   ```bash
   NODE_ENV=production node dist/index.js
   ```

3. **Utiliser PM2 pour la production**
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name "cadastre-ia"
   pm2 save
   pm2 startup
   ```

## Migrations de Base de Données

### Créer une Nouvelle Migration

```bash
npx knex migrate:make nom_de_la_migration
```

### Exécuter les Migrations

```bash
npx knex migrate:latest
```

### Annuler la Dernière Migration

```bash
npx knex migrate:rollback
```

## Configuration des Stratégies de Sécurité

### Politique des Mots de Passe
- Longueur minimale : 12 caractères
- Au moins une majuscule, une minuscule, un chiffre et un caractère spécial
- Vérification contre les fuites de données connues

### Gestion des Sessions
- Durée de session : 24 heures
- Renouvellement automatique du jeton
- Invalidation des sessions lors du changement de mot de passe

### Protection contre les Attaques
- Limite de taux (rate limiting)
- Protection CSRF
- En-têtes de sécurité HTTP

## Surveillance et Maintenance

### Journaux
- Les journaux sont stockés dans `/var/log/cadastre-ia/`
- Rotation des journaux configurée pour 30 jours

### Surveillance des Performances
- Métriques exposées sur `/metrics` (format Prometheus)
- Alertes configurées pour :
  - Temps de réponse > 1s
  - Taux d'erreur > 1%
  - Utilisation CPU > 80%

### Sauvegarde des Données
- Sauvegarde quotidienne à 2h00
- Rétention : 7 jours
- Stockage chiffré hors site

## Mise à Jour

1. **Mettre à jour le code**
   ```bash
   git pull origin main
   ```

2. **Mettre à jour les dépendances**
   ```bash
   npm install
   npm run build
   ```

3. **Appliquer les migrations**
   ```bash
   npx knex migrate:latest
   ```

4. **Redémarrer le serveur**
   ```bash
   pm2 restart cadastre-ia
   ```

## Dépannage

### Problème : Les rôles ne sont pas appliqués
- Vérifier que le middleware `requireRole` est correctement configuré
- Vérifier les permissions dans la base de données

### Problème : Les appareils ne sont pas approuvés
- Vérifier la configuration des politiques d'appareils
- Vérifier les journaux pour les erreurs d'approbation

## Support

Pour toute question ou problème, contactez :
- Support technique : support@cadastre-ia.com
- Urgences : +33 1 23 45 67 89

## Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.
