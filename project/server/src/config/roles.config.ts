export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export enum Permission {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  SYNC = 'SYNC',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_ROLES = 'MANAGE_ROLES',
  AUDIT = 'AUDIT'
}

export enum DeviceType {
  PC = 'PC',
  MOBILE = 'MOBILE',
  TABLET = 'TABLET',
  SERVER = 'SERVER'
}

export interface RoleProfile {
  role: UserRole;
  permissions: Permission[];
  mobility: 'AMOVIBLE' | 'SEMI_AMOVIBLE' | 'NON_AMOVIBLE';
  deviceTypes: DeviceType[];
  behavior: {
    character: string;
    expectedBehavior: string;
    prompts: string[];
    autoSuggestions: boolean;
  };
  syncPriority: number; // 1 (faible) à 10 (haute)
  conflictResolution: 'AUTO' | 'MANUAL' | 'HIERARCHICAL';
}

export const ROLE_PROFILES: Record<UserRole, RoleProfile> = {
  [UserRole.USER]: {
    role: UserRole.USER,
    permissions: [Permission.READ],
    mobility: 'AMOVIBLE',
    deviceTypes: [DeviceType.MOBILE, DeviceType.TABLET],
    behavior: {
      character: 'Curieux, autonome, respectueux',
      expectedBehavior: 'Consultation et annotation des données existantes',
      prompts: [
        'Explorez les données avec attention',
        'Vos annotations sont précieuses pour la communauté',
        'Respectez l\'intégrité des informations consultées'
      ],
      autoSuggestions: true
    },
    syncPriority: 3,
    conflictResolution: 'AUTO'
  },
  [UserRole.ADMIN]: {
    role: UserRole.ADMIN,
    permissions: [Permission.READ, Permission.WRITE, Permission.DELETE, Permission.SYNC],
    mobility: 'SEMI_AMOVIBLE',
    deviceTypes: [DeviceType.PC, DeviceType.MOBILE, DeviceType.TABLET],
    behavior: {
      character: 'Rigoureux, pédagogue, responsable',
      expectedBehavior: 'Modification, validation et gestion locale des données',
      prompts: [
        'Votre responsabilité engage la qualité du cadastre',
        'Vérifiez chaque entrée avec rigueur',
        'Formez les utilisateurs aux bonnes pratiques',
        'Documentez chaque modification significative'
      ],
      autoSuggestions: true
    },
    syncPriority: 7,
    conflictResolution: 'MANUAL'
  },
  [UserRole.SUPER_ADMIN]: {
    role: UserRole.SUPER_ADMIN,
    permissions: [
      Permission.READ,
      Permission.WRITE,
      Permission.DELETE,
      Permission.SYNC,
      Permission.MANAGE_USERS,
      Permission.MANAGE_ROLES,
      Permission.AUDIT
    ],
    mobility: 'NON_AMOVIBLE',
    deviceTypes: [DeviceType.SERVER, DeviceType.PC],
    behavior: {
      character: 'Visionnaire, éthique, stratège',
      expectedBehavior: 'Contrôle total, gestion des rôles et synchronisation globale',
      prompts: [
        'Votre vision définit l\'évolution du système',
        'Priorisez l\'intégrité et la cohérence des données',
        'Auditez régulièrement les activités critiques',
        'Anticipez les besoins futurs du réseau'
      ],
      autoSuggestions: true
    },
    syncPriority: 10,
    conflictResolution: 'HIERARCHICAL'
  }
};

// Helper : Vérifier une permission
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PROFILES[role].permissions.includes(permission);
}

// Helper : Obtenir les prompts d'un rôle
export function getRolePrompts(role: UserRole): string[] {
  return ROLE_PROFILES[role].behavior.prompts;
}

// Helper : Résoudre un conflit selon le rôle
export function resolveConflictByRole(role1: UserRole, role2: UserRole): UserRole {
  const priority1 = ROLE_PROFILES[role1].syncPriority;
  const priority2 = ROLE_PROFILES[role2].syncPriority;
  return priority1 >= priority2 ? role1 : role2;
}
