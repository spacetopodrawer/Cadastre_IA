/**
 * VersionTracker - Gestion du versionnement des objets cartographiques
 * Permet le suivi des modifications, le rollback et la comparaison de versions
 */

type CartoChange = {
  action: 'add' | 'modify' | 'delete';
  objectId: string;
  before?: any;
  after?: any;
  timestamp?: number;
  userId?: string;
};

type CartoVersion = {
  versionId: string;
  missionId: string;
  timestamp: number;
  userId: string;
  changes: CartoChange[];
  comment?: string;
};

type VersionDiff = {
  added: CartoChange[];
  modified: Array<{ before: any; after: any; objectId: string }>;
  deleted: CartoChange[];
};

class VersionTracker {
  private versions: Map<string, CartoVersion[]> = new Map();
  private static instance: VersionTracker;

  private constructor() {}

  static getInstance(): VersionTracker {
    if (!VersionTracker.instance) {
      VersionTracker.instance = new VersionTracker();
    }
    return VersionTracker.instance;
  }

  /**
   * Enregistre une nouvelle version des changements
   */
  recordChange(missionId: string, userId: string, changes: CartoChange | CartoChange[], comment?: string): CartoVersion {
    const versionId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const changeArray = Array.isArray(changes) ? changes : [changes];
    
    // Ajouter des métadonnées aux changements
    const timestampedChanges = changeArray.map(change => ({
      ...change,
      timestamp: change.timestamp || Date.now(),
      userId: change.userId || userId,
    }));

    const newVersion: CartoVersion = {
      versionId,
      missionId,
      timestamp: Date.now(),
      userId,
      changes: timestampedChanges,
      comment,
    };

    const existing = this.versions.get(missionId) || [];
    this.versions.set(missionId, [...existing, newVersion]);
    
    return newVersion;
  }

  /**
   * Récupère l'historique complet d'une mission
   */
  getHistory(missionId: string): CartoVersion[] {
    return [...(this.versions.get(missionId) || [])].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Récupère une version spécifique
   */
  getVersion(missionId: string, versionId: string): CartoVersion | undefined {
    const history = this.versions.get(missionId) || [];
    return history.find(v => v.versionId === versionId);
  }

  /**
   * Effectue un rollback à une version antérieure
   */
  rollback(missionId: string, versionId: string, userId: string, comment = `Rollback to version ${versionId}`): CartoVersion | null {
    const history = this.versions.get(missionId) || [];
    const targetIndex = history.findIndex(v => v.versionId === versionId);
    
    if (targetIndex === -1) return null;

    // Créer une nouvelle version avec les changements inversés
    const rollbackChanges: CartoChange[] = [];
    const targetVersion = history[targetIndex];
    
    // Pour chaque version après la cible, inverser les changements
    for (let i = history.length - 1; i > targetIndex; i--) {
      const version = history[i];
      for (const change of version.changes) {
        // Inverser l'action pour le rollback
        const rollbackChange: CartoChange = {
          action: this.getInverseAction(change.action),
          objectId: change.objectId,
          before: change.after,
          after: change.before,
        };
        rollbackChanges.push(rollbackChange);
      }
    }

    if (rollbackChanges.length > 0) {
      return this.recordChange(missionId, userId, rollbackChanges, comment);
    }
    
    return null;
  }

  /**
   * Compare deux versions et retourne les différences
   */
  diffVersions(version1: CartoVersion, version2: CartoVersion): VersionDiff {
    const diff: VersionDiff = {
      added: [],
      modified: [],
      deleted: [],
    };

    const allObjects = new Set([
      ...version1.changes.map(c => c.objectId),
      ...version2.changes.map(c => c.objectId)
    ]);

    for (const objectId of allObjects) {
      const v1 = version1.changes.find(c => c.objectId === objectId);
      const v2 = version2.changes.find(c => c.objectId === objectId);

      if (v1 && !v2) {
        diff.deleted.push(v1);
      } else if (!v1 && v2) {
        diff.added.push(v2);
      } else if (v1 && v2 && JSON.stringify(v1.after) !== JSON.stringify(v2.after)) {
        diff.modified.push({
          objectId,
          before: v1.after,
          after: v2.after
        });
      }
    }

    return diff;
  }

  /**
   * Vérifie si un objet a été modifié depuis une certaine version
   */
  hasObjectChanged(missionId: string, objectId: string, sinceVersionId: string): boolean {
    const history = this.getHistory(missionId);
    const versionIndex = history.findIndex(v => v.versionId === sinceVersionId);
    
    if (versionIndex === -1) return false;

    // Vérifier les versions plus récentes que sinceVersionId
    for (let i = 0; i < versionIndex; i++) {
      const version = history[i];
      if (version.changes.some(change => change.objectId === objectId)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Supprime toutes les versions d'une mission
   */
  clearMissionHistory(missionId: string): boolean {
    return this.versions.delete(missionId);
  }

  private getInverseAction(action: string): 'add' | 'modify' | 'delete' {
    switch (action) {
      case 'add': return 'delete';
      case 'delete': return 'add';
      case 'modify':
      default: return 'modify';
    }
  }
}

// Export en tant que singleton
export const versionTracker = VersionTracker.getInstance();

export type { CartoVersion, CartoChange, VersionDiff };
