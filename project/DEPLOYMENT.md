# 🚀 GUIDE DE DÉPLOIEMENT SÉCURISÉ CADASTRE_IA

## Prérequis
- Node.js 18+
- npm
- Deux PC sur le même réseau (pour tests multi-PC)
- Git (pour la gestion des clés)

## 1) Configuration initiale

### Cloner le dépôt
```bash
git clone [URL_DU_DEPOT] cadastre-ia
cd cadastre-ia
```

### 2) Backend (server)
```bash
cd server
npm install
cp .env.example .env
# Éditez .env avec vos paramètres
npm run dev
```
API: http://localhost:5000

### 3) Frontend (client)
```bash
cd ../project
npm install
cp .env.example .env
# Éditez .env avec VITE_API_URL
npm run dev
```
App: http://localhost:5173

## Configuration des identifiants administrateur

1. Créez un fichier `credentials.json` à partir du modèle :
   ```bash
   cp credentials.example.json credentials.json
   ```

2. Modifiez le fichier `credentials.json` avec vos informations :
   - Remplacez `admin@example.com` par l'email administrateur
   - Choisissez un mot de passe fort
   - Mettez à jour le `secretKey` par une clé secrète complexe

3. Chiffrez le fichier des identifiants :
   ```bash
   # Définissez une clé de chiffrement sécurisée
   $env:ENCRYPTION_KEY="votre_clé_secrète_très_longue_et_complexe"
   
   # Chiffrez le fichier
   node scripts/encrypt_credentials.js encrypt credentials.json
   ```
   
   Cela créera un fichier `credentials.json.enc` chiffré.

4. Supprimez le fichier `credentials.json` non chiffré :
   ```bash
   rm credentials.json
   ```

5. Pour créer un administrateur, utilisez la commande :
   ```bash
   # Définissez d'abord la clé de chiffrement
   $env:ENCRYPTION_KEY="votre_clé_secrète_très_longue_et_complexe"
   
   # Exécutez le script de création d'admin
   node scripts/create_admin.js
   ```

## Multi-PC
- Sur PC serveur: notez l'IP locale (ex: 192.168.1.100)
- Sur PC client: dans `project/.env` mettez `VITE_API_URL=http://192.168.1.100:5000`

## Dépannage
- Port 5000 ouvert pare-feu
- WebSocket: vérifier `http://IP:5000/socket.io/`
- Upload: vérifier dossier `server/uploads/`

## Sécurité

- Ne partagez jamais le fichier `credentials.json.enc` sans la clé de chiffrement
- Ne versionnez pas `credentials.json` ou `credentials.json.enc` dans git
- Gardez la clé de chiffrement en sécurité (utilisez un gestionnaire de mots de passe)
- Régénérez périodiquement les clés et mots de passe

## Récupération d'urgence

Si vous avez perdu l'accès au compte administrateur :
1. Arrêtez le serveur
2. Régénérez un nouveau fichier `credentials.json`
3. Chiffrez-le avec une nouvelle clé
4. Redémarrez le serveur

## Journal des modifications

| Date       | Description                          | Auteur         |
|------------|--------------------------------------|----------------|
| 2024-10-27 | Mise en place du chiffrement des identifiants | Administrateur |
