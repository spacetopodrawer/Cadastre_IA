import { GNSSProcessor } from './GNSSProcessor';
import { IMUReader } from './IMUReader';
import { OCRAgent } from '../ocr/OCRAgent';
import { ocrCorrectionMemory } from '../ocr/OCRCorrectionMemory';

/**
 * Represents GNSS data with position and metadata
 */
export interface GNSSData {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp: number;
  source: 'GNSS' | 'RTCM' | 'NMEA' | 'RTK';
  accuracy?: number; // in meters
  hdop?: number; // Horizontal Dilution of Precision
  vdop?: number; // Vertical Dilution of Precision
  satellites?: number; // Number of satellites in use
  fixQuality?: number; // GPS quality indicator
}

/**
 * Represents IMU sensor data
 */
export interface IMUData {
  acceleration: [number, number, number]; // m/s²
  gyroscope: [number, number, number];    // rad/s
  magnetometer?: [number, number, number]; // μT
  orientation?: {
    alpha: number; // z-axis rotation (0-360°)
    beta: number;  // x-axis rotation (-180° to 180°)
    gamma: number; // y-axis rotation (-90° to 90°)
  };
  timestamp: number;
  accuracy?: number; // Estimated accuracy in degrees
}

/**
 * Represents an OCR anchor point
 */
export interface OCRAnchor {
  text: string;
  classification: string;
  confidence: number;
  position: {
    lat: number;
    lon: number;
    alt?: number;
  };
  timestamp: number;
  source?: string; // Source of the OCR data (e.g., 'camera', 'image', 'document')
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * Represents a fused position with confidence and source information
 */
export interface FusedPosition {
  position: {
    lat: number;
    lon: number;
    alt?: number;
  };
  orientation?: {
    pitch: number; // Rotation around x-axis (radians)
    roll: number;  // Rotation around y-axis (radians)
    yaw: number;   // Rotation around z-axis (radians)
  };
  accuracy: number; // Estimated accuracy in meters
  timestamp: number;
  sources: string[]; // Sources used for this position
  anchors?: OCRAnchor[]; // OCR anchors used for positioning
  metadata?: {
    gnss?: Partial<GNSSData>;
    imu?: Partial<IMUData>;
    corrections?: Array<{
      type: string;
      value: number;
      source: string;
    }>;
  };
}

/**
 * Configuration for the sensor fusion
 */
export interface SensorFusionConfig {
  /**
   * Weight for GNSS data (0-1)
   * Higher values prioritize GNSS over other sources
   */
  gnssWeight?: number;
  
  /**
   * Weight for IMU data (0-1)
   * Higher values prioritize IMU over other sources
   */
  imuWeight?: number;
  
  /**
   * Weight for OCR anchor points (0-1)
   * Higher values prioritize OCR anchors over other sources
   */
  ocrWeight?: number;
  
  /**
   * Maximum age of GNSS data in milliseconds
   */
  maxGnssAge?: number;
  
  /**
   * Maximum age of IMU data in milliseconds
   */
  maxImuAge?: number;
  
  /**
   * Maximum age of OCR anchor data in milliseconds
   */
  maxOcrAge?: number;
  
  /**
   * Enable/disable automatic calibration
   */
  autoCalibrate?: boolean;
  
  /**
   * Enable/disable offline mode
   */
  offlineMode?: boolean;
}

/**
 * Main SensorFusion class for fusing GNSS, IMU, and OCR data
 */
export class SensorFusion {
  private gnssProcessor: GNSSProcessor;
  private imuReader: IMUReader;
  private ocrAgent: OCRAgent;
  private config: Required<SensorFusionConfig>;
  
  private lastPosition: FusedPosition | null = null;
  private lastGnss: GNSSData | null = null;
  private lastImu: IMUData | null = null;
  private lastAnchors: OCRAnchor[] = [];
  
  private calibrationData: {
    gnssBias: { x: number; y: number; z: number };
    imuBias: { x: number; y: number; z: number };
    magnetometerBias?: { x: number; y: number; z: number };
  } = {
    gnssBias: { x: 0, y: 0, z: 0 },
    imuBias: { x: 0, y: 0, z: 0 },
    magnetometerBias: { x: 0, y: 0, z: 0 },
  };

  constructor(
    gnssProcessor: GNSSProcessor,
    imuReader: IMUReader,
    ocrAgent: OCRAgent,
    config: SensorFusionConfig = {}
  ) {
    this.gnssProcessor = gnssProcessor;
    this.imuReader = imuReader;
    this.ocrAgent = ocrAgent;
    
    // Set default configuration
    this.config = {
      gnssWeight: 0.6,
      imuWeight: 0.3,
      ocrWeight: 0.1,
      maxGnssAge: 5000, // 5 seconds
      maxImuAge: 1000,  // 1 second
      maxOcrAge: 10000, // 10 seconds
      autoCalibrate: true,
      offlineMode: false,
      ...config,
    };
    
    // Normalize weights
    const totalWeight = this.config.gnssWeight + this.config.imuWeight + this.config.ocrWeight;
    this.config.gnssWeight /= totalWeight;
    this.config.imuWeight /= totalWeight;
    this.config.ocrWeight /= totalWeight;
    
    // Initialize event listeners
    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners for data sources
   */
  private initializeEventListeners(): void {
    // Listen for GNSS updates
    this.gnssProcessor.on('update', (data: GNSSData) => {
      this.lastGnss = data;
      this.updateFusedPosition();
    });
    
    // Listen for IMU updates
    this.imuReader.on('update', (data: IMUData) => {
      this.lastImu = data;
      this.updateFusedPosition();
    });
    
    // Listen for OCR anchor updates
    this.ocrAgent.on('anchorDetected', (anchor: OCRAnchor) => {
      // Add the anchor to our list, replacing any existing anchor with the same text
      this.lastAnchors = [
        ...this.lastAnchors.filter(a => a.text !== anchor.text),
        anchor
      ];
      this.updateFusedPosition();
    });
  }

  /**
   * Update the fused position based on available data
   */
  private updateFusedPosition(): void {
    const now = Date.now();
    let hasNewData = false;
    
    // Check if we have fresh GNSS data
    const hasFreshGnss = this.lastGnss && 
      (now - this.lastGnss.timestamp) <= this.config.maxGnssAge;
    
    // Check if we have fresh IMU data
    const hasFreshImu = this.lastImu && 
      (now - this.lastImu.timestamp) <= this.config.maxImuAge;
    
    // Filter out old anchors
    const freshAnchors = this.lastAnchors.filter(
      anchor => (now - anchor.timestamp) <= this.config.maxOcrAge
    );
    
    // If no fresh data, return early
    if (!hasFreshGnss && !hasFreshImu && freshAnchors.length === 0) {
      return;
    }
    
    let fusedPosition: FusedPosition;
    
    if (hasFreshGnss) {
      // Start with GNSS as the base position
      fusedPosition = this.fuseGnssWithImu(this.lastGnss, this.lastImu);
      hasNewData = true;
    } else if (hasFreshImu && this.lastPosition) {
      // If no GNSS but we have IMU and a previous position, use dead reckoning
      fusedPosition = this.deadReckoning(this.lastPosition, this.lastImu);
      hasNewData = true;
    } else if (freshAnchors.length > 0) {
      // If we only have OCR anchors, use the most confident one
      const bestAnchor = this.getBestAnchor(freshAnchors);
      fusedPosition = this.positionFromAnchor(bestAnchor);
      hasNewData = true;
    } else {
      // No new data to process
      return;
    }
    
    // Apply any OCR anchor corrections if available
    if (freshAnchors.length > 0) {
      fusedPosition = this.applyOcrCorrections(fusedPosition, freshAnchors);
    }
    
    // Update the last position
    this.lastPosition = fusedPosition;
    
    // Emit the updated position
    this.emit('positionUpdate', fusedPosition);
  }

  /**
   * Fuse GNSS and IMU data
   */
  private fuseGnssWithImu(gnss: GNSSData, imu: IMUData | null): FusedPosition {
    const basePosition: FusedPosition = {
      position: {
        lat: gnss.latitude,
        lon: gnss.longitude,
        alt: gnss.altitude,
      },
      accuracy: gnss.accuracy || 10, // Default to 10m if not provided
      timestamp: gnss.timestamp,
      sources: [gnss.source],
      metadata: {
        gnss: { ...gnss },
      },
    };
    
    // If we have IMU data, fuse it
    if (imu) {
      basePosition.orientation = {
        pitch: imu.acceleration[0],
        roll: imu.acceleration[1],
        yaw: imu.gyroscope[2],
      };
      
      // If we have a previous position, we can do better fusion
      if (this.lastPosition) {
        // Simple complementary filter for position
        const alpha = 0.1; // Weight for new GNSS data
        
        basePosition.position.lat = alpha * gnss.latitude + (1 - alpha) * this.lastPosition.position.lat;
        basePosition.position.lon = alpha * gnss.longitude + (1 - alpha) * this.lastPosition.position.lon;
        
        if (gnss.altitude && this.lastPosition.position.alt) {
          basePosition.position.alt = alpha * gnss.altitude + (1 - alpha) * this.lastPosition.position.alt;
        }
        
        // Update sources
        basePosition.sources.push('IMU');
        basePosition.metadata!.imu = { ...imu };
      }
    }
    
    return basePosition;
  }

  /**
   * Estimate new position using dead reckoning from last known position and IMU data
   */
  private deadReckoning(lastPosition: FusedPosition, imu: IMUData): FusedPosition {
    // This is a simplified dead reckoning implementation
    // In a real application, you'd want to integrate acceleration to get velocity and position
    
    const timeDelta = (imu.timestamp - lastPosition.timestamp) / 1000; // in seconds
    
    // Simple model: assume constant velocity from last known position
    // This would be enhanced with proper integration of acceleration
    const newPosition: FusedPosition = {
      ...lastPosition,
      timestamp: imu.timestamp,
      sources: [...lastPosition.sources.filter(s => s !== 'deadReckoning'), 'deadReckoning'],
      accuracy: Math.min(lastPosition.accuracy * 1.1, 100), // Increase uncertainty over time, max 100m
    };
    
    // Update orientation
    if (imu.orientation) {
      newPosition.orientation = {
        pitch: imu.orientation.beta * (Math.PI / 180), // Convert to radians
        roll: imu.orientation.gamma * (Math.PI / 180),
        yaw: imu.orientation.alpha * (Math.PI / 180),
      };
    }
    
    return newPosition;
  }

  /**
   * Get the best anchor from a list of anchors
   */
  private getBestAnchor(anchors: OCRAnchor[]): OCRAnchor {
    // Sort by confidence and take the highest
    return [...anchors].sort((a, b) => b.confidence - a.confidence)[0];
  }

  /**
   * Create a position from an OCR anchor
   */
  private positionFromAnchor(anchor: OCRAnchor): FusedPosition {
    return {
      position: { ...anchor.position },
      accuracy: 5, // Default accuracy for OCR anchors in meters
      timestamp: anchor.timestamp,
      sources: ['OCR'],
      anchors: [anchor],
    };
  }

  /**
   * Apply OCR-based corrections to the current position
   */
  private applyOcrCorrections(
    position: FusedPosition, 
    anchors: OCRAnchor[]
  ): FusedPosition {
    if (anchors.length === 0) return position;
    
    // For now, we'll just use the most confident anchor
    const bestAnchor = this.getBestAnchor(anchors);
    
    // If we have high confidence in the anchor, use its position
    if (bestAnchor.confidence > 0.8) {
      return {
        ...position,
        position: { ...bestAnchor.position },
        accuracy: 2, // Higher accuracy for anchor-based positioning
        anchors: [bestAnchor],
      };
    }
    
    // Otherwise, average with the current position
    return {
      ...position,
      position: {
        lat: (position.position.lat + bestAnchor.position.lat) / 2,
        lon: (position.position.lon + bestAnchor.position.lon) / 2,
        alt: position.position.alt && bestAnchor.position.alt 
          ? (position.position.alt + bestAnchor.position.alt) / 2 
          : position.position.alt || bestAnchor.position.alt,
      },
      accuracy: Math.max(position.accuracy, 5), // Don't get too confident
      anchors: [bestAnchor],
    };
  }

  /**
   * Start the sensor fusion
   */
  public start(): void {
    this.gnssProcessor.start();
    this.imuReader.start();
    this.ocrAgent.start();
  }

  /**
   * Stop the sensor fusion
   */
  public stop(): void {
    this.gnssProcessor.stop();
    this.imuReader.stop();
    this.ocrAgent.stop();
  }

  /**
   * Reset the sensor fusion
   */
  public reset(): void {
    this.lastPosition = null;
    this.lastGnss = null;
    this.lastImu = null;
    this.lastAnchors = [];
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<SensorFusionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Event emitter implementation (simplified)
  private listeners: Record<string, Function[]> = {};
  
  public on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  public off(event: string, callback: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  
  private emit(event: string, ...args: any[]): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }
}

// Export a singleton instance
export const sensorFusion = new SensorFusion(
  new GNSSProcessor(),
  new IMUReader(),
  new OCRAgent()
);
