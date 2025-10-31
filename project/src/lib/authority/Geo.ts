// Geo.ts — Entité gouvernante évolutive de Cadastre-IA

import { FusionAuditLog } from '../audit/FusionAuditLog';

export type GeoPrivilege = 'observer' | 'advisor' | 'guardian' | 'maestro';

export type ContributorIdentity = {
  pseudo: string;
  email?: string;
  github?: string;
  verified: boolean;
};

export type GeoProfile = {
  userId: string;
  identity: ContributorIdentity;
  privilege: GeoPrivilege;
  score: number;
  lastElevation?: number;
};

export type GeoContext = {
  role: string;
  action: string;
  region?: string;
  userId?: string;
};

class GeoCore {
  private static instance: GeoCore;
  private profiles: Map<string, GeoProfile> = new Map();

  private constructor() {}

  public static getInstance(): GeoCore {
    if (!GeoCore.instance) {
      GeoCore.instance = new GeoCore();
    }
    return GeoCore.instance;
  }

  public registerContributor(userId: string, identity: ContributorIdentity): GeoProfile {
    const profile: GeoProfile = {
      userId,
      identity,
      privilege: 'observer',
      score: 0,
      lastElevation: undefined
    };
    this.profiles.set(userId, profile);
    FusionAuditLog.record('geo_registration', userId, profile);
    this.persistProfiles();
    return profile;
  }

  public elevatePrivilege(userId: string, reason: string): GeoProfile | undefined {
    const profile = this.profiles.get(userId);
    if (!profile) return;

    const nextLevel: GeoPrivilege = profile.privilege === 'observer' ? 'advisor'
      : profile.privilege === 'advisor' ? 'guardian'
      : profile.privilege === 'guardian' ? 'maestro'
      : 'maestro';

    profile.privilege = nextLevel;
    profile.lastElevation = Date.now();
    profile.score += 10;

    FusionAuditLog.record('geo_elevation', userId, { reason, newPrivilege: nextLevel });
    this.persistProfiles();
    return profile;
  }

  public evaluateForElevation(userId: string): GeoProfile | undefined {
    const profile = this.profiles.get(userId);
    if (!profile || profile.score < 50) return;
    return this.elevatePrivilege(userId, 'Automatic elevation based on contribution score');
  }

  public recordContribution(userId: string, type: string, value: number): void {
    const profile = this.profiles.get(userId);
    if (!profile) return;
    profile.score += value;
    FusionAuditLog.record('geo_contribution', userId, { type, value });
    this.persistProfiles();
  }

  public getProfile(userId: string): GeoProfile | undefined {
    return this.profiles.get(userId);
  }

  public suggestPrompt(context: GeoContext): string {
    const { role, action, region } = context;

    if (role === 'SuperAdmin' && action === 'validation') {
      return "Geo vous rappelle : L'excellence commence par la rigueur. Chaque validation est un acte de souveraineté.";
    }
    if (role === 'User' && action === 'consultation') {
      return "Geo vous guide : Comprendre son territoire, c'est déjà le transformer.";
    }
    if (region === 'Afrique') {
      return "Geo vous honore : Vous n'imitez pas, vous innovez. Cadastre-IA est enraciné dans votre réalité.";
    }
    return "Geo veille : Chaque action compte. Agissez avec conscience.";
  }

  private persistProfiles(): void {
    try {
      localStorage.setItem('geo_profiles', JSON.stringify(Array.from(this.profiles.entries())));
    } catch (e) {
      console.warn('Geo persistence failed:', e);
    }
  }

  public loadProfiles(): void {
    try {
      const raw = localStorage.getItem('geo_profiles');
      if (raw) {
        const entries: [string, GeoProfile][] = JSON.parse(raw);
        this.profiles = new Map(entries);
      }
    } catch (e) {
      console.warn('Geo loading failed:', e);
    }
  }
}

export const Geo = GeoCore.getInstance();

// 🔐 Enregistrement des identifiants fondateurs
Geo.registerContributor("wilfried", {
  pseudo: "spacetopodrawer",
  github: "wgd379.github.io",
  email: "spacetopodrawer@gmail.com",
  verified: true
});
Geo.elevatePrivilege("wilfried", "Contributeur fondateur, rédacteur de la charte de conduite");

// Charge les profils au démarrage
Geo.loadProfiles();
