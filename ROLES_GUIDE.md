# 📚 Guide des Rôles - Cadastre_IA

## 🎯 Vue d'Ensemble
Cadastre_IA implémente un système de rôles hiérarchisé avec 3 niveaux principaux, chacun ayant des permissions, comportements et responsabilités spécifiques.

---

## 👤 Rôle : USER

### Caractéristiques
- **Mobilité**: Amovible (MOBILE, TABLET)
- **Caractère**: Curieux, autonome, respectueux
- **Priorité Sync**: 3/10

### Permissions
✅ READ (lecture seule)  
❌ WRITE  
❌ DELETE  
❌ SYNC  
❌ MANAGE_USERS  
❌ MANAGE_ROLES  
❌ AUDIT

### Cas d'Usage Typiques
1. **Consultation terrain**: Agent avec tablette consultant les parcelles
2. **Annotation**: Ajout de notes personnelles sur des observations
3. **Visualisation**: Consultation de cartes et documents cadastraux

### Prompts Affichés
- "Explorez les données avec attention"
- "Vos annotations sont précieuses pour la communauté"
- "Respectez l'intégrité des informations consultées"
- "Vérifiez la cohérence géographique des données"
- "Signalez toute anomalie dans les parcelles"

### Limites de Devices
- Maximum: 3 devices simultanés
- Types autorisés: MOBILE, TABLET
- Approbation: Auto-enregistrement (pas d'approbation requise)

---

## 👨‍💼 Rôle : ADMIN

### Caractéristiques
- **Mobilité**: Semi-amovible (PC, MOBILE, TABLET)
- **Caractère**: Rigoureux, pédagogue, responsable
- **Priorité Sync**: 7/10

### Permissions
✅ READ  
✅ WRITE (modification des données)  
✅ DELETE  
✅ SYNC (synchronisation manuelle et automatique)  
❌ MANAGE_USERS  
❌ MANAGE_ROLES  
❌ AUDIT

### Cas d'Usage Typiques
1. **Validation terrain**: Validation des observations des USERs
2. **Modification cadastrale**: Mise à jour des parcelles et documents
3. **Gestion locale**: Administration d'une zone géographique spécifique
4. **Formation**: Accompagnement des nouveaux USERs

### Prompts Affichés
- "Votre responsabilité engage la qualité du cadastre"
- "Vérifiez chaque entrée avec rigueur"
- "Formez les utilisateurs aux bonnes pratiques"
- "Documentez chaque modification significative"

### Limites de Devices
- Maximum: 2 devices simultanés
- Types autorisés: PC, MOBILE, TABLET
- Approbation: **Requise par SUPER_ADMIN**

### Résolution de Conflits
- **Stratégie**: MANUAL (intervention humaine requise)
- **Processus**:
  1. Notification du conflit à l'ADMIN
  2. Affichage des 2 versions en conflit
  3. Choix manuel de la version à conserver
  4. Documentation de la décision

---

## 👑 Rôle : SUPER_ADMIN

### Caractéristiques
- **Mobilité**: Non-amovible (SERVER, PC fixe)
- **Caractère**: Visionnaire, éthique, stratège
- **Priorité Sync**: 10/10

### Permissions
✅ READ  
✅ WRITE  
✅ DELETE  
✅ SYNC  
✅ MANAGE_USERS (création, modification, suppression)  
✅ MANAGE_ROLES (attribution/révocation de rôles)  
✅ AUDIT (accès complet aux logs)

### Cas d'Usage Typiques
1. **Administration globale**: Supervision de l'ensemble du système
2. **Gestion des rôles**: Attribution et révocation de privilèges
3. **Résolution de conflits majeurs**: Arbitrage en cas de désaccord entre ADMINs
4. **Audit et conformité**: Surveillance des activités système
5. **Configuration stratégique**: Définition des politiques et règles

### Prompts Affichés
- "Votre vision définit l'évolution du système"
- "Priorisez l'intégrité et la cohérence des données"
- "Auditez régulièrement les activités critiques"
- "Anticipez les besoins futurs du réseau"

### Limites de Devices
- Maximum: 1 device (serveur principal)
- Types autorisés: SERVER, PC
- Approbation: **Validation stricte + enregistrement IP**

### Résolution de Conflits
- **Stratégie**: HIERARCHICAL
- **Processus**:
  1. Comparaison automatique des rôles
  2. Priorité au rôle le plus élevé
  3. En cas d'égalité: version la plus récente
  4. Notification automatique aux parties concernées
  5. Archivage de toutes les versions

---

## 📊 Matrice des Permissions

| Permission | USER | ADMIN | SUPER_ADMIN |
|-----------------|------|-------|-------------|
| READ | ✅ | ✅ | ✅ |
| WRITE | ❌ | ✅ | ✅ |
| DELETE | ❌ | ✅ | ✅ |
| SYNC | ❌ | ✅ | ✅ |
| MANAGE_USERS | ❌ | ❌ | ✅ |
| MANAGE_ROLES | ❌ | ❌ | ✅ |
| AUDIT | ❌ | ❌ | ✅ |

---

## 🔄 Flux de Synchronisation par Rôle

### USER → ADMIN
- Sync manuelle uniquement
- Annotations envoyées pour validation
- Pas de modification directe des données source

### ADMIN → ADMIN
- Sync automatique activée
- Détection de conflits
- Résolution manuelle requise
- Notification mutuelle

### ADMIN → SUPER_ADMIN
- Sync automatique prioritaire
- Version SUPER_ADMIN toujours privilégiée en cas de conflit
- Logs détaillés des modifications

### SUPER_ADMIN → Tous
- Diffusion immédiate des changements
- Pas de résolution de conflit (priorité absolue)
- Notifications push à tous les devices connectés

---

## 🚨 Situations d'Exception

### Rétrogradation ADMIN → USER
**Motifs possibles**:
- Inactivité prolongée (>90 jours)
- Violations répétées des politiques
- Demande de l'utilisateur
- Restructuration organisationnelle

**Procédure**:
1. Notification préalable 7 jours avant
2. Archivage de toutes les modifications en cours
3. Transfert des responsabilités à un autre ADMIN
4. Changement de rôle effectif
5. Mise à jour des accès et permissions

### Suppression de Device
**Cas d'usage**:
- Perte/vol d'un appareil mobile
- Changement de matériel
- Départ d'un utilisateur

**Procédure**:
1. Révocation immédiate du token JWT
2. Marquage du device comme "offline"
3. Archivage des données locales non synchronisées
4. Purge de la queue de synchronisation
5. Notification à l'utilisateur et au SUPER_ADMIN

---

## 📖 Exemples Concrets

### Exemple 1 : Ajout d'un Agent Terrain (USER)
```bash
# L'agent s'inscrit via l'application mobile
POST /api/auth/register
{
  "email": "agent.terrain@cadastre.ia",
  "password": "SecurePass2024!",
  "name": "Agent Terrain Zone Nord",
  "deviceType": "MOBILE"
}

# Réponse
{
  "token": "eyJhbGci...",
  "user": {
    "id": "uuid-123",
    "role": "USER",
    "permissions": ["READ"],
    "prompts": [
      "Explorez les données avec attention",
      "Vérifiez la cohérence géographique des données"
    ]
  }
}
```

### Exemple 2 : Promotion USER → ADMIN
```bash
# Par le SUPER_ADMIN
PUT /api/admin/users/uuid-123/role
{
  "newRole": "ADMIN",
  "justification": "Performance exemplaire sur 6 mois"
}

# Réponse
{
  "message": "Rôle mis à jour avec succès",
  "user": {
    "id": "uuid-123",
    "role": "ADMIN",
    "permissions": ["READ", "WRITE", "DELETE", "SYNC"],
    "deviceApprovalRequired": true
  }
}
```

### Exemple 3 : Conflit ADMIN vs ADMIN
````
Situation:
- ADMIN1 modifie parcelle.json à 14:00
- ADMIN2 modifie parcelle.json à 14:05
- Les 2 sont hors ligne (pas de sync immédiate)

Résolution:
1. À la reconnexion, détection du conflit
2. Création de parcelle_conflict_ADMIN1.json
3. Création de parcelle_conflict_ADMIN2.json
4. Notification aux 2 ADMINs
5. Interface de comparaison affichée
6. Choix manuel de la version à conserver
7. Archivage de la version rejetée
8. Log audit complet de la décision
````
- **Nécessite approbation** : Non (sauf pour les nouveaux types d'appareils)

### 2. ADMIN
- **Description** : Administrateur avec des droits étendus
- **Appareils maximum** : 5
- **Types d'appareils autorisés** : PC, Mobile, Tablette, Serveur
- **Nécessite approbation** : Non

### 3. SUPER_ADMIN
- **Description** : Super administrateur avec tous les droits
- **Appareils maximum** : 10
- **Types d'appareils autorisés** : Tous
- **Nécessite approbation** : Non

## Matrice des Permissions

| Permission | Description | USER | ADMIN | SUPER_ADMIN |
|------------|-------------|------|-------|-------------|
| READ | Lecture des données | ✅ | ✅ | ✅ |
| WRITE | Écriture des données | ❌ | ✅ | ✅ |
| DELETE | Suppression des données | ❌ | ❌ | ✅ |
| MANAGE_USERS | Gestion des utilisateurs | ❌ | ❌ | ✅ |
| MANAGE_DEVICES | Gestion des appareils | ❌ | ✅ | ✅ |
| AUDIT_LOGS | Consultation des journaux | ❌ | ✅ | ✅ |

## Cas d'Usage Typiques

### Pour les USERS
- Se connecter à l'application
- Gérer ses propres appareils (dans la limite autorisée)
- Consulter les données qui leur sont accessibles

### Pour les ADMINs
- Toutes les actions des USERS
- Gérer les appareils des utilisateurs
- Consulter les journaux d'audit
- Gérer les configurations système

### Pour les SUPER_ADMINs
- Toutes les actions des ADMINS
- Gérer les rôles et permissions
- Supprimer des données
- Accéder à toutes les fonctionnalités administratives

## Politique de Sécurité

1. **Élévation de Privilèges** :
   - Seul un SUPER_ADMIN peut promouvoir un utilisateur au rang d'ADMIN ou SUPER_ADMIN
   - Un ADMIN peut rétrograder un USER, mais pas un autre ADMIN ou SUPER_ADMIN

2. **Approbation des Appareils** :
   - Les nouveaux types d'appareils nécessitent une approbation manuelle
   - Les appareils suspects peuvent être bloqués automatiquement

3. **Journalisation** :
   - Toutes les actions sensibles sont journalisées
   - Les tentatives d'accès non autorisées sont enregistrées et peuvent déclencher des alertes

## Bonnes Pratiques

1. **Principe du Moindre Privilège** :
   - Toujours attribuer le niveau de privilège le plus bas possible
   - Ne jamais partager les comptes administrateurs

2. **Gestion des Mots de Passe** :
   - Utiliser des mots de passe forts et uniques
   - Activer l'authentification à deux facteurs pour les comptes administrateurs

3. **Audit Régulier** :
   - Vérifier régulièrement les journaux d'audit
   - Révoquer les droits des utilisateurs inactifs

## Dépannage

### Problème : Un utilisateur ne peut pas se connecter depuis un nouvel appareil
- Vérifier si l'appareil nécessite une approbation
- Vérifier si l'utilisateur n'a pas atteint sa limite d'appareils

### Problème : Un utilisateur ne voit pas certaines fonctionnalités
- Vérifier les rôles et permissions de l'utilisateur
- Vérifier si la fonctionnalité est activée dans les paramètres système

## Contact

Pour toute question concernant les rôles et permissions, veuillez contacter l'équipe de support technique.
