import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type CalibrationSource = 'manual' | 'auto' | 'agent';

export interface CalibrationProfile {
  id: string;
  name: string;
  timestamp: number;
  source: CalibrationSource;
  bias: {
    lat: number;
    lon: number;
    alt: number;
  };
  orientationOffset?: {
    pitch: number;
    roll: number;
    yaw: number;
  };
  imuBias?: {
    acceleration: [number, number, number];
    gyroscope: [number, number, number];
    magnetometer?: [number, number, number];
  };
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface CalibrationResult {
  success: boolean;
  profile: CalibrationProfile | null;
  error?: string;
  metrics?: {
    positionError: number; // in meters
    orientationError: number; // in degrees
  };
}

const STORAGE_KEY = 'calibrationProfiles';

// Create a writable store for calibration profiles
const createCalibrationStore = () => {
  const { subscribe, set, update } = writable<CalibrationProfile[]>([]);
  
  // Load from localStorage if in browser
  if (browser) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load calibration profiles:', e);
      }
    }
  }
  
  // Save to localStorage on changes
  if (browser) {
    subscribe(profiles => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
      } catch (e) {
        console.error('Failed to save calibration profiles:', e);
      }
    });
  }
  
  return {
    subscribe,
    add: (profile: Omit<CalibrationProfile, 'id' | 'timestamp'>) => {
      const newProfile: CalibrationProfile = {
        ...profile,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      
      update(profiles => [...profiles, newProfile]);
      return newProfile;
    },
    update: (id: string, updates: Partial<CalibrationProfile>) => {
      update(profiles => 
        profiles.map(profile => 
          profile.id === id ? { ...profile, ...updates } : profile
        )
      );
    },
    remove: (id: string) => {
      update(profiles => profiles.filter(profile => profile.id !== id));
    },
    clear: () => set([]),
    getBestMatch: (position: {
      lat: number;
      lon: number;
      alt?: number;
    }): CalibrationProfile | null => {
      let bestMatch: CalibrationProfile | null = null;
      let bestScore = -Infinity;
      
      // This would be implemented based on your matching logic
      // For now, just return the most recent profile
      update(profiles => {
        if (profiles.length === 0) return profiles;
        
        const sorted = [...profiles].sort((a, b) => b.timestamp - a.timestamp);
        bestMatch = sorted[0];
        return profiles;
      });
      
      return bestMatch;
    }
  };
};

export const calibrationProfiles = createCalibrationStore();

export class CalibrationProtocol {
  /**
   * Perform a manual calibration using a known reference position
   */
  static async calibrateManual(
    reference: {
      lat: number;
      lon: number;
      alt?: number;
    },
    measured: {
      lat: number;
      lon: number;
      alt?: number;
      orientation?: {
        pitch: number;
        roll: number;
        yaw: number;
      };
      imuBias?: {
        acceleration: [number, number, number];
        gyroscope: [number, number, number];
        magnetometer?: [number, number, number];
      };
    },
    name = 'Manual Calibration'
  ): Promise<CalibrationResult> {
    try {
      const bias = {
        lat: reference.lat - measured.lat,
        lon: reference.lon - measured.lon,
        alt: (reference.alt || 0) - (measured.alt || 0)
      };
      
      const profile = calibrationProfiles.add({
        name,
        source: 'manual',
        bias,
        orientationOffset: measured.orientation ? {
          pitch: -measured.orientation.pitch,
          roll: -measured.orientation.roll,
          yaw: -measured.orientation.yaw
        } : undefined,
        imuBias: measured.imuBias,
        confidence: 0.9, // High confidence for manual calibration
        metadata: {
          reference,
          measured
        }
      });
      
      return {
        success: true,
        profile,
        metrics: {
          positionError: Math.sqrt(bias.lat * bias.lat + bias.lon * bias.lon) * 111320, // Convert to meters
          orientationError: 0 // Would calculate based on orientation difference
        }
      };
    } catch (error) {
      console.error('Manual calibration failed:', error);
      return {
        success: false,
        profile: null,
        error: error instanceof Error ? error.message : 'Unknown error during calibration'
      };
    }
  }
  
  /**
   * Perform an automatic calibration by collecting sensor data over time
   */
  static async calibrateAuto(duration = 10000): Promise<CalibrationResult> {
    return new Promise((resolve) => {
      if (!browser) {
        return resolve({
          success: false,
          profile: null,
          error: 'Auto-calibration is only available in the browser'
        });
      }
      
      // This would be implemented with actual sensor data collection
      // For now, we'll simulate a successful calibration after the duration
      console.log(`Starting auto-calibration for ${duration}ms...`);
      
      setTimeout(() => {
        const profile = calibrationProfiles.add({
          name: 'Auto Calibration',
          source: 'auto',
          bias: { lat: 0, lon: 0, alt: 0 },
          confidence: 0.7,
          metadata: {
            duration,
            timestamp: Date.now()
          }
        });
        
        resolve({
          success: true,
          profile,
          metrics: {
            positionError: 2.5, // meters
            orientationError: 1.2 // degrees
          }
        });
      }, duration);
    });
  }
  
  /**
   * Apply calibration to a position
   */
  static applyCalibration(
    position: {
      lat: number;
      lon: number;
      alt?: number;
      orientation?: {
        pitch: number;
        roll: number;
        yaw: number;
      };
    },
    profile: CalibrationProfile
  ) {
    const calibrated = {
      lat: position.lat + profile.bias.lat,
      lon: position.lon + profile.bias.lon,
      alt: position.alt !== undefined ? position.alt + profile.bias.alt : undefined,
      orientation: position.orientation && profile.orientationOffset ? {
        pitch: position.orientation.pitch + profile.orientationOffset.pitch,
        roll: position.orientation.roll + profile.orientationOffset.roll,
        yaw: position.orientation.yaw + profile.orientationOffset.yaw
      } : position.orientation
    };
    
    return calibrated;
  }
  
  /**
   * Find the best calibration profile for a given position
   */
  static findBestCalibration(position: {
    lat: number;
    lon: number;
    alt?: number;
  }): Promise<CalibrationProfile | null> {
    return new Promise((resolve) => {
      // In a real implementation, this would consider:
      // 1. Distance to known calibration points
      // 2. Time since calibration
      // 3. Confidence of the calibration
      // 4. Environmental conditions
      
      // For now, just return the most recent profile
      let bestProfile: CalibrationProfile | null = null;
      
      const unsubscribe = calibrationProfiles.subscribe(profiles => {
        if (profiles.length === 0) {
          bestProfile = null;
          return;
        }
        
        // Sort by timestamp (newest first) and take the first one
        bestProfile = [...profiles].sort((a, b) => b.timestamp - a.timestamp)[0];
      });
      
      // Unsubscribe and resolve
      unsubscribe();
      resolve(bestProfile);
    });
  }
  
  /**
   * Export calibration profiles
   */
  static exportProfiles(): string {
    let profiles: CalibrationProfile[] = [];
    
    // Get current profiles synchronously
    const unsubscribe = calibrationProfiles.subscribe(p => {
      profiles = p;
    });
    unsubscribe();
    
    return JSON.stringify(profiles, null, 2);
  }
  
  /**
   * Import calibration profiles
   */
  static importProfiles(json: string): { success: boolean; count: number; errors: string[] } {
    try {
      const profiles = JSON.parse(json);
      
      if (!Array.isArray(profiles)) {
        throw new Error('Invalid format: expected an array of profiles');
      }
      
      const errors: string[] = [];
      let importedCount = 0;
      
      profiles.forEach((profile, index) => {
        try {
          // Validate required fields
          if (!profile.bias || typeof profile.bias.lat !== 'number' || typeof profile.bias.lon !== 'number') {
            throw new Error(`Profile at index ${index} is missing required bias fields`);
          }
          
          // Add the profile
          calibrationProfiles.add({
            ...profile,
            // Ensure these fields are set correctly
            id: crypto.randomUUID(),
            timestamp: profile.timestamp || Date.now(),
            source: profile.source || 'imported',
            confidence: Math.min(1, Math.max(0, profile.confidence || 0.5))
          });
          
          importedCount++;
        } catch (error) {
          errors.push(`Failed to import profile at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
      
      return {
        success: errors.length === 0,
        count: importedCount,
        errors
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        errors: [error instanceof Error ? error.message : 'Failed to parse profiles']
      };
    }
  }
  
  /**
   * Clear all calibration profiles
   */
  static clearAll(): void {
    calibrationProfiles.clear();
  }
}
