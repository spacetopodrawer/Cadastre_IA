import { v4 as uuidv4 } from 'uuid';
import { remoteLinkManager } from '../network/RemoteLinkManager';
import { deviceSecurityPolicy } from '../security/DeviceSecurityPolicy';
import { fusionAuditLog } from '../security/FusionAuditLog';

export type MissionResolution = 'low' | 'medium' | 'high';
export type MissionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface MissionZone {
  id: string;
  name: string;
  type: 'polygon' | 'rectangle' | 'circle' | 'polyline';
  coordinates: GeoPoint[];
  properties?: Record<string, any>;
}

export interface DroneMission {
  id: string;
  name: string;
  description?: string;
  zone: MissionZone;
  altitude: number; // en mètres
  resolution: MissionResolution;
  overlap: {
    front: number; // % de recouvrement avant/arrière (0-100)
    side: number;  // % de recouvrement latéral (0-100)
  };
  speed: number; // m/s
  heading: 'north' | 'south' | 'east' | 'west' | number; // direction du vol en degrés (0-360)
  gimbalPitch: number; // angle de la caméra en degrés (-90 à 0)
  photosCount: number;
  estimatedTime: number; // en secondes
  distance: number; // en mètres
  assignedTo: string; // deviceId
  status: MissionStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string; // userId
  metadata?: Record<string, any>;
  waypoints?: GeoPoint[];
}

class DroneMissionPlannerClass {
  private missions: Map<string, DroneMission> = new Map();
  private missionStatusListeners: Map<string, Set<(status: MissionStatus) => void>> = new Map();

  /**
   * Crée une nouvelle mission drone
   */
  public createMission(params: {
    name: string;
    description?: string;
    zone: Omit<MissionZone, 'id'>;
    altitude: number;
    resolution: MissionResolution;
    overlap?: { front: number; side: number };
    speed?: number;
    heading?: 'north' | 'south' | 'east' | 'west' | number;
    gimbalPitch?: number;
    assignedTo: string;
    createdBy: string;
    metadata?: Record<string, any>;
  }): DroneMission {
    const missionId = uuidv4();
    const zoneId = `zone-${uuidv4()}`;
    
    const defaultOverlap = { front: 70, side: 60 };
    const defaultSpeed = 5; // m/s
    const defaultGimbalPitch = -90; // vers le bas
    
    const mission: DroneMission = {
      id: missionId,
      name: params.name,
      description: params.description,
      zone: {
        id: zoneId,
        ...params.zone,
      },
      altitude: Math.max(10, Math.min(params.altitude, 120)), // Limite 10-120m
      resolution: params.resolution,
      overlap: { ...defaultOverlap, ...(params.overlap || {}) },
      speed: params.speed || defaultSpeed,
      heading: params.heading || 'north',
      gimbalPitch: params.gimbalPitch !== undefined ? params.gimbalPitch : defaultGimbalPitch,
      photosCount: 0, // Sera calculé
      estimatedTime: 0, // Sera calculé
      distance: 0, // Sera calculé
      assignedTo: params.assignedTo,
      status: 'pending',
      createdAt: new Date(),
      createdBy: params.createdBy,
      metadata: params.metadata || {},
    };

    // Calculer les waypoints et les métadonnées de vol
    this.calculateFlightPlan(mission);
    
    this.missions.set(missionId, mission);
    
    // Journaliser la création de la mission
    fusionAuditLog.logSecurityEvent({
      action: 'mission_created',
      deviceId: params.assignedTo,
      userId: params.createdBy,
      details: {
        missionId,
        zone: params.zone,
        altitude: mission.altitude,
        resolution: mission.resolution,
      },
      status: 'success',
    });

    return mission;
  }

  /**
   * Calcule le plan de vol et met à jour les métadonnées de la mission
   */
  private calculateFlightPlan(mission: DroneMission): void {
    // Simulation de calcul de plan de vol
    // Dans une implémentation réelle, cela utiliserait des algorithmes de planification de vol
    const zoneArea = this.calculateZoneArea(mission.zone);
    
    // Estimation du nombre de photos basée sur la zone et la résolution
    const resolutionFactor = {
      'low': 10,
      'medium': 20,
      'high': 40
    }[mission.resolution] || 20;
    
    const overlapFactor = (mission.overlap.front / 100) * (mission.overlap.side / 100);
    mission.photosCount = Math.ceil(zoneArea * resolutionFactor * (1 - overlapFactor));
    
    // Estimation de la distance et du temps de vol
    mission.distance = zoneArea * 1.5; // Simplification
    mission.estimatedTime = Math.ceil(mission.distance / mission.speed);
    
    // Génération des waypoints (simplifiée)
    mission.waypoints = this.generateWaypoints(mission.zone);
  }

  /**
   * Calcule la surface de la zone de mission
   */
  private calculateZoneArea(zone: MissionZone): number {
    // Implémentation simplifiée - utiliser une bibliothèque comme turf.js pour des calculs précis
    if (zone.coordinates.length < 3) return 0;
    
    // Formule de l'aire de Gauss (formule du lacet)
    let area = 0;
    const n = zone.coordinates.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = zone.coordinates[i].longitude;
      const yi = zone.coordinates[i].latitude;
      const xj = zone.coordinates[j].longitude;
      const yj = zone.coordinates[j].latitude;
      
      area += xi * yj - xj * yi;
    }
    
    return Math.abs(area / 2);
  }

  /**
   * Génère des waypoints pour la mission
   */
  private generateWaypoints(zone: MissionZone): GeoPoint[] {
    // Implémentation simplifiée - génère des waypoints le long du périmètre
    return zone.coordinates.map(coord => ({
      latitude: coord.latitude,
      longitude: coord.longitude,
      altitude: 0, // L'altitude sera définie au moment du vol
    }));
  }

  /**
   * Lance une mission
   */
  public async launchMission(missionId: string): Promise<boolean> {
    const mission = this.missions.get(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} non trouvée`);
    }

    // Vérifier les permissions
    const hasPermission = await deviceSecurityPolicy.hasPermission(
      mission.createdBy,
      'drone:mission:launch',
      { missionId }
    );

    if (!hasPermission) {
      throw new Error('Permissions insuffisantes pour lancer cette mission');
    }

    // Générer un jeton pour le drone
    const token = await deviceSecurityPolicy.generateToken(
      mission.assignedTo,
      {
        permissions: ['mission:execute'],
        expiresIn: '24h',
        metadata: {
          missionId: mission.id,
          zone: mission.zone.id,
          resolution: mission.resolution,
        },
      }
    );

    // Préparer la charge utile pour le drone
    const payload = {
      type: 'mission_start',
      mission: {
        id: mission.id,
        name: mission.name,
        waypoints: mission.waypoints?.map(wp => ({
          latitude: wp.latitude,
          longitude: wp.longitude,
          altitude: mission.altitude,
        })),
        speed: mission.speed,
        gimbalPitch: mission.gimbalPitch,
        resolution: mission.resolution,
        overlap: mission.overlap,
      },
      token,
      timestamp: new Date().toISOString(),
    };

    try {
      // Envoyer la commande au drone
      const response = await remoteLinkManager.sendCommand(
        mission.assignedTo,
        'start_mission',
        payload
      );

      // Mettre à jour le statut de la mission
      mission.status = 'in_progress';
      mission.startedAt = new Date();
      
      // Notifier les écouteurs
      this.notifyStatusChange(missionId, 'in_progress');
      
      // Journaliser le lancement
      await fusionAuditLog.logSecurityEvent({
        action: 'mission_started',
        deviceId: mission.assignedTo,
        userId: mission.createdBy,
        details: {
          missionId: mission.id,
          zone: mission.zone,
          waypoints: mission.waypoints?.length,
        },
        status: 'success',
      });

      return true;
    } catch (error) {
      console.error('Erreur lors du lancement de la mission:', error);
      
      // Mettre à jour le statut en échec
      mission.status = 'failed';
      this.notifyStatusChange(missionId, 'failed');
      
      // Journaliser l'échec
      await fusionAuditLog.logSecurityEvent({
        action: 'mission_failed',
        deviceId: mission.assignedTo,
        userId: mission.createdBy,
        details: {
          missionId: mission.id,
          error: error instanceof Error ? error.message : String(error),
        },
        status: 'error',
      });
      
      return false;
    }
  }

  /**
   * Met à jour le statut d'une mission
   */
  public async updateMissionStatus(
    missionId: string, 
    status: MissionStatus,
    metadata: Record<string, any> = {}
  ): Promise<boolean> {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    const previousStatus = mission.status;
    mission.status = status;
    
    // Mettre à jour les horodatages appropriés
    const now = new Date();
    if (status === 'completed') {
      mission.completedAt = now;
    }
    
    // Mettre à jour les métadonnées
    mission.metadata = { ...mission.metadata, ...metadata };
    
    // Notifier les écouteurs
    this.notifyStatusChange(missionId, status);
    
    // Journaliser le changement de statut
    await fusionAuditLog.logSecurityEvent({
      action: `mission_${status}`,
      deviceId: mission.assignedTo,
      userId: mission.createdBy,
      details: {
        missionId: mission.id,
        previousStatus,
        newStatus: status,
        ...metadata,
      },
      status: status === 'failed' ? 'error' : 'success',
    });
    
    return true;
  }

  /**
   * Récupère une mission par son ID
   */
  public getMission(missionId: string): DroneMission | undefined {
    return this.missions.get(missionId);
  }

  /**
   * Liste toutes les missions
   */
  public listMissions(filter: {
    status?: MissionStatus | MissionStatus[];
    deviceId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): DroneMission[] {
    let missions = Array.from(this.missions.values());
    
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      missions = missions.filter(m => statuses.includes(m.status));
    }
    
    if (filter.deviceId) {
      missions = missions.filter(m => m.assignedTo === filter.deviceId);
    }
    
    if (filter.userId) {
      missions = missions.filter(m => m.createdBy === filter.userId);
    }
    
    if (filter.startDate) {
      missions = missions.filter(m => m.createdAt >= filter.startDate!);
    }
    
    if (filter.endDate) {
      missions = missions.filter(m => m.createdAt <= filter.endDate!);
    }
    
    return missions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Annule une mission en cours
   */
  public async cancelMission(missionId: string, reason?: string): Promise<boolean> {
    const mission = this.missions.get(missionId);
    if (!mission) return false;
    
    if (mission.status !== 'in_progress') {
      throw new Error('Seules les missions en cours peuvent être annulées');
    }
    
    try {
      // Envoyer la commande d'annulation au drone
      await remoteLinkManager.sendCommand(mission.assignedTo, 'cancel_mission', {
        missionId,
        timestamp: new Date().toISOString(),
        reason,
      });
      
      // Mettre à jour le statut
      return this.updateMissionStatus(missionId, 'cancelled', { reason });
    } catch (error) {
      console.error('Erreur lors de l\'annulation de la mission:', error);
      return false;
    }
  }

  /**
   * Ajoute un écouteur pour les changements de statut d'une mission
   */
  public onMissionStatusChange(
    missionId: string, 
    callback: (status: MissionStatus, mission: DroneMission) => void
  ): () => void {
    if (!this.missionStatusListeners.has(missionId)) {
      this.missionStatusListeners.set(missionId, new Set());
    }
    
    const listeners = this.missionStatusListeners.get(missionId)!;
    listeners.add(callback);
    
    // Retourne une fonction pour se désabonner
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.missionStatusListeners.delete(missionId);
      }
    };
  }

  /**
   * Notifie les écouteurs d'un changement de statut
   */
  private notifyStatusChange(missionId: string, status: MissionStatus): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    
    const listeners = this.missionStatusListeners.get(missionId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(status, { ...mission });
        } catch (error) {
          console.error('Erreur dans un écouteur de statut de mission:', error);
        }
      }
    }
  }
}

// Exporte une instance singleton
export const DroneMissionPlanner = new DroneMissionPlannerClass();

// Exporte également le type pour une utilisation externe
export type { DroneMissionPlannerClass };

export default DroneMissionPlanner;
