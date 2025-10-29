# 🧪 SCÉNARIO DE TEST COMPLET - 2 PC

## 🎯 Objectif
Valider la synchronisation bidirectionnelle de fichiers entre 2 PC via réseau local.

## 🖥️ Configuration

### PC-A (192.168.1.100) - Serveur Principal
- **Rôle**: SUPER_ADMIN
- **Exécute**: Backend + Frontend
- **Utilisateur**: admin@cadastre.ia

### PC-B (192.168.1.101) - Client
- **Rôle**: USER
- **Exécute**: Frontend uniquement
- **Utilisateur**: user@cadastre.ia

---

## 📝 PHASE 1: Initialisation (10 min)

### Sur PC-A

#### Étape 1.1: Démarrer le backend
```bash
cd server
npm run dev
```

**Attendu**: ✅ Serveur démarre sur port 5000

#### Étape 1.2: Créer le compte admin
```bash
curl -X POST http://localhost:5000/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cadastre.ia",
    "password": "Admin123!",
    "name": "Administrateur Principal",
    "secretKey": "CADASTRE_IA_INIT_2024"
  }'
```

**Attendu**: ✅ Compte admin créé

#### Étape 1.3: Démarrer le frontend
```bash
npm run dev
```

**Attendu**: ✅ Interface accessible sur http://localhost:5173

#### Étape 1.4: Se connecter
- Email: admin@cadastre.ia
- Password: Admin123!

**Attendu**: ✅ Connexion réussie, dashboard visible

### Sur PC-B

#### Étape 1.5: Configurer l'URL du serveur
Créer `.env`:
```env
VITE_API_URL=http://192.168.1.100:5000
```

#### Étape 1.6: Démarrer le frontend
```bash
npm run dev
```

#### Étape 1.7: Créer un compte utilisateur
- Aller sur http://localhost:5173
- Cliquer "Inscription"
- Email: user@cadastre.ia
- Password: User123!
- Nom: Utilisateur Test

**Attendu**: ✅ Compte créé et connecté automatiquement

---

## 📁 PHASE 2: Test Upload de Fichier (5 min)

### Sur PC-A

#### Étape 2.1: Uploader un document
1. Aller dans "Gestionnaire de Fichiers"
2. Cliquer "Upload"
3. Sélectionner un fichier PDF (ex: test-document.pdf)

**Attendu**: 
- ✅ Fichier apparaît dans la liste
- ✅ Statut: "SYNCED"
- ✅ Console backend affiche: `📤 Fichier uploadé: test-document.pdf` 

### Sur PC-B

#### Étape 2.2: Vérifier la réception
1. Observer la liste de fichiers
2. Le fichier doit apparaître automatiquement

**Attendu**:
- ✅ Fichier visible dans la liste
- ✅ Notification: "Nouveau fichier disponible"
- ✅ Console affiche: `📥 Fichier disponible pour sync: test-document.pdf` 

#### Étape 2.3: Télécharger le fichier
1. Cliquer sur le fichier
2. Cliquer "Télécharger"

**Attendu**:
- ✅ Barre de progression affichée
- ✅ Fichier téléchargé dans Downloads/
- ✅ Contenu identique à l'original

---

## 🎨 PHASE 3: Test Éditeur Paint (10 min)

### Sur PC-A

#### Étape 3.1: Créer un dessin
1. Cliquer "Nouvel éditeur Paint"
2. Dessiner quelque chose (ex: carré rouge + cercle bleu)
3. Cliquer "Sauvegarder"
4. Nom: "dessin-test.png"

**Attendu**:
- ✅ Image créée et visible dans la liste
- ✅ Taille > 0 bytes
- ✅ Type: image/png

### Sur PC-B

#### Étape 3.2: Recevoir et ouvrir le dessin
1. Le fichier apparaît automatiquement
2. Cliquer dessus
3. Cliquer "Ouvrir dans Paint"

**Attendu**:
- ✅ Image s'ouvre dans l'éditeur
- ✅ Dessin identique à l'original

#### Étape 3.3: Modifier le dessin
1. Ajouter un triangle vert
2. Cliquer "Sauvegarder"

**Attendu**:
- ✅ Nouvelle version créée (v2)
- ✅ Notification envoyée à PC-A

### Sur PC-A

#### Étape 3.4: Voir la modification
1. Observer la notification: "Fichier modifié par PC-B"
2. Rafraîchir la liste
3. Ouvrir le fichier

**Attendu**:
- ✅ Triangle vert visible
- ✅ Historique montre 2 versions
- ✅ Version 2 créée par "Utilisateur Test"

---

## 🔄 PHASE 4: Test Synchronisation Bidirectionnelle (10 min)

### Sur PC-B

#### Étape 4.1: Uploader un fichier texte
1. Créer un fichier "notes.txt" avec contenu: "Version 1 de PC-B"
2. L'uploader

### Sur PC-A

#### Étape 4.2: Modifier le fichier
1. Télécharger "notes.txt"
2. Modifier le contenu: "Version 2 de PC-A"
3. Re-uploader

### Sur PC-B

#### Étape 4.3: Recevoir la mise à jour
1. Observer la notification
2. Télécharger la nouvelle version

**Attendu**:
- ✅ Contenu: "Version 2 de PC-A"
- ✅ Historique: 2 versions visibles
- ✅ Timestamps corrects

---

## 👥 PHASE 5: Test Gestion Multi-Utilisateurs (5 min)

### Sur PC-A (admin)

#### Étape 5.1: Créer un deuxième utilisateur
1. Aller dans "Admin Panel"
2. Cliquer "Créer utilisateur"
3. Email: editor@cadastre.ia
4. Nom: Éditeur
5. Rôle: EDITOR

**Attendu**: ✅ Utilisateur créé avec rôle EDITOR

#### Étape 5.2: Partager un fichier
1. Sélectionner "dessin-test.png"
2. Cliquer "Partager"
3. Sélectionner "editor@cadastre.ia"
4. Permission: WRITE

**Attendu**: ✅ Fichier partagé

### Sur PC-B (editor)

#### Étape 5.3: Déconnexion/Reconnexion
1. Se déconnecter, se reconnecter comme editor

#### Étape 5.4: Accéder au fichier partagé
1. Voir "dessin-test.png" dans "Fichiers partagés"
2. L'ouvrir et le modifier

**Attendu**:
- ✅ Fichier accessible en modification
- ✅ Modification sauvegardée
- ✅ Notification envoyée aux autres utilisateurs

---

## 🔌 PHASE 6: Test Déconnexion/Reconnexion (5 min)

### Sur PC-B

#### Étape 6.1: Simuler une déconnexion
1. Fermer l'onglet
2. Attendre 10 secondes

### Sur PC-A

#### Étape 6.2: Vérifier le statut
1. "Dashboard Admin" > "Devices en ligne"

**Attendu**: 
- ✅ PC-B hors ligne
- ✅ Last seen récent

### Sur PC-B

#### Étape 6.3: Reconnecter
1. Rouvrir l'application et se reconnecter

### Sur PC-A

#### Étape 6.4: Vérifier le retour en ligne
1. Rafraîchir le dashboard

**Attendu**: ✅ PC-B en ligne, notification reçue

---

## 📊 PHASE 7: Sync Quotidienne (Simulation)

```bash
curl -X POST http://localhost:5000/api/sync/trigger-daily \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 🐛 PHASE 8: Gestion des Conflits

1. Déconnecter les 2 PC du réseau
2. Modifier le même fichier sur les deux
3. Reconnecter

**Attendu**:
- ✅ Conflit détecté
- ✅ Deux versions concurrentes créées

---

## ✅ Checklist
- [ ] Inscription/Connexion
- [ ] Upload/Téléchargement/Suppression
- [ ] Versions et historique
- [ ] Notifications temps réel
- [ ] Multi-utilisateurs et permissions
- [ ] Performance et stabilité websocket
