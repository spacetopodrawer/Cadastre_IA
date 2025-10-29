# 🧪 Scénarios de Test Cadastre_IA

## Test 1 : Ajout d'un USER Mobile

**Contexte :** Un nouvel utilisateur avec smartphone

```bash
# Sur le mobile
POST /api/auth/register
{
  "email": "user.mobile@cadastre.ia",
  "password": "User2024!",
  "name": "Utilisateur Mobile",
  "deviceType": "MOBILE"
}

# Vérification attendue
✅ Compte créé avec rôle USER
✅ Device auto-enregistré (pas d'approbation)
✅ Sync manuelle activée
✅ Prompts affichés : "Explorez les données avec attention"
```

## Test 2 : Ajout d'un ADMIN PC

**Contexte :** Un administrateur terrain avec PC portable

```bash
# Sur le PC Admin
POST /api/auth/register
{
  "email": "admin.terrain@cadastre.ia",
  "password": "Admin2024!",
  "name": "Admin Terrain",
  "deviceType": "PC"
}

# Sur le serveur (SUPER_ADMIN)
POST /api/admin/approve-device
{
  "userId": "<user_id>",
  "approve": true
}

# Vérification attendue
✅ Compte créé avec rôle ADMIN (après approbation)
✅ Permissions : READ, WRITE, DELETE, SYNC
✅ Sync automatique activée
✅ Prompts : "Vérifiez chaque entrée avec rigueur"
```

## Test 3 : Conflit de Synchronisation

**Contexte :** 2 ADMINs modifient le même fichier

```bash
# ADMIN1 (PC1) modifie fichier.txt à 14:00
# ADMIN2 (PC2) modifie fichier.txt à 14:05

# Résolution attendue
✅ Détection du conflit
✅ Résolution MANUAL (car rôle ADMIN)
✅ Notification aux 2 ADMINs
✅ Fichier.txt_conflict_ADMIN1
✅ Fichier.txt_conflict_ADMIN2
✅ SUPER_ADMIN notifié pour arbitrage
```

## Test 4 : Suppression d'un Device

**Contexte :** Un PC Admin est désactivé

```bash
# Par SUPER_ADMIN
DELETE /api/devices/:deviceId

# Vérification attendue
✅ Token révoqué
✅ Device marqué offline
✅ Données archivées
✅ Rôle rétrogradé ou transféré
✅ Sync queue purgée
```

## Test 5 : Audit Comportemental

**Contexte :** Vérifier les actions d'un ADMIN

```bash
GET /api/audit/user/:userId

# Réponse attendue
✅ Historique complet des modifications
✅ Horodatage précis
✅ Fichiers modifiés
✅ Conflits résolus
✅ Comportement conforme aux prompts
```

Exécute ces tests manuellement puis automatise-les avec Jest/Supertest.
