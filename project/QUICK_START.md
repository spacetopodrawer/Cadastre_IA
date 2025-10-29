# 🚀 Démarrage Rapide - 5 Minutes

## Première fois
```bash
# 1) Setup automatique
npm run setup

# 2) Installer les dépendances
cd server && npm install
cd .. && npm install

# 3) Démarrer (2 terminaux)
# Terminal 1
cd server && npm run dev
# Terminal 2
npm run dev

# 4) Créer le premier admin
curl -X POST http://localhost:5000/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cadastre.ia","password":"Admin123!","name":"Admin","secretKey":"CADASTRE_IA_INIT_2024"}'

# 5) Ouvrir le navigateur
# http://localhost:5173
```

## Test entre 2 PC

### PC 1 (Serveur)
1. Démarrer normalement
2. Noter votre IP: `ipconfig` (Windows) ou `ifconfig` (Linux/Mac) — ex: 192.168.1.100

### PC 2 (Client)
1. Modifier `.env`:
```env
VITE_API_URL=http://192.168.1.100:5000
```
2. Démarrer: `npm run dev`
3. Créer un compte utilisateur

### Tester la synchronisation
- PC1: Uploader un fichier
- PC2: Le fichier apparaît automatiquement ✅
- PC2: Modifier le fichier
- PC1: Voir la modification en temps réel ✅

## Dépannage Express

- **Erreur "EADDRINUSE" (port 5000)**
```bash
# Windows
netstat -ano | findstr :5000
 taskkill /PID <PID> /F
# Linux/Mac
lsof -i :5000
 kill -9 <PID>
```

- **Erreur "Cannot connect"** (pare-feu)
```bash
# Windows: autoriser l'appli Node sur port 5000
# Linux: sudo ufw allow 5000
```
