import { RoleConfig, RolePermission, DeviceType } from '../types/roles';

export const ROLES: Record<string, RoleConfig> = {
  USER: {
    name: 'USER',
    displayName: 'Utilisateur',
    description: 'Utilisateur standard avec accès en lecture seule',
    maxDevices: 3,
    allowedDeviceTypes: ['MOBILE', 'TABLET'],
    requiresApproval: false,
    priority: 1,
    permissions: [
      'READ'
    ],
    syncStrategy: 'MANUAL',
    prompts: [
      'Explorez les données avec attention',
      'Vos annotations sont précieuses pour la communauté',
      'Respectez l\'intégrité des informations consultées',
      'Vérifiez la cohérence géographique des données',
      'Signalez toute anomalie dans les parcelles'
    ]
  },
  ADMIN: {
    name: 'ADMIN',
    displayName: 'Administrateur',
    description: 'Administrateur avec droits de modification',
    maxDevices: 2,
    allowedDeviceTypes: ['PC', 'MOBILE', 'TABLET'],
    requiresApproval: true,
    priority: 5,
    permissions: [
      'READ',
      'WRITE',
      'DELETE',
      'SYNC'
    ],
    syncStrategy: 'MANUAL',
    conflictResolution: 'MANUAL',
    prompts: [
      'Votre responsabilité engage la qualité du cadastre',
      'Vérifiez chaque entrée avec rigueur',
      'Formez les utilisateurs aux bonnes pratiques',
      'Documentez chaque modification significative'
    ]
  },
  SUPER_ADMIN: {
    name: 'SUPER_ADMIN',
    displayName: 'Super Administrateur',
    description: 'Administrateur système avec tous les droits',
    maxDevices: 1,
    allowedDeviceTypes: ['SERVER', 'PC'],
    requiresApproval: true,
    priority: 10,
    permissions: [
      'READ',
      'WRITE',
      'DELETE',
      'SYNC',
      'MANAGE_USERS',
      'MANAGE_ROLES',
      'AUDIT'
    ],
    syncStrategy: 'AUTOMATIC',
    conflictResolution: 'HIERARCHICAL',
    prompts: [
      'Votre vision définit l\'évolution du système',
      'Priorisez l\'intégrité et la cohérence des données',
      'Auditez régulièrement les activités critiques',
      'Anticipez les besoins futurs du réseau'
    ]
  }
} as const;

export const PERMISSIONS: Record<string, RolePermission> = {
  READ: {
    name: 'READ',
    description: 'Permission de lecture des données'
  },
  WRITE: {
    name: 'WRITE',
    description: 'Permission de modification des données'
  },
  DELETE: {
    name: 'DELETE',
    description: 'Permission de suppression des données'
  },
  SYNC: {
    name: 'SYNC',
    description: 'Permission de synchronisation des données'
  },
  MANAGE_USERS: {
    name: 'MANAGE_USERS',
    description: 'Gestion des utilisateurs'
  },
  MANAGE_ROLES: {
    name: 'MANAGE_ROLES',
    description: 'Gestion des rôles et permissions'
  },
  AUDIT: {
    name: 'AUDIT',
    description: 'Accès aux journaux d\'audit'
  }
};

export const DEVICE_TYPES = {
  PC: 'PC',
  MOBILE: 'MOBILE',
  TABLET: 'TABLET',
  SERVER: 'SERVER'
} as const;

export const SYNC_STRATEGIES = {
  MANUAL: 'MANUAL',
  AUTOMATIC: 'AUTOMATIC'
} as const;

export const CONFLICT_RESOLUTION_STRATEGIES = {
  MANUAL: 'MANUAL',
  HIERARCHICAL: 'HIERARCHICAL',
  LAST_WRITE_WINS: 'LAST_WRITE_WINS'
} as const;

// Fonctions utilitaires
export function hasPermission(role: string, permission: string): boolean {
  return ROLES[role]?.permissions.includes(permission) || false;
}

export function getRolePrompts(role: string): string[] {
  return ROLES[role]?.prompts || [];
}

export function resolveConflict(userRole: string, targetRole: string): boolean {
  const userPriority = ROLES[userRole]?.priority || 0;
  const targetPriority = ROLES[targetRole]?.priority || 0;
  return userPriority > targetPriority;
}
