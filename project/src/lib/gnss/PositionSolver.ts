import * as math from 'mathjs';
import { CoordinateSystemManager } from './CoordinateSystemManager';
import { FusionAuditLog } from '../telemetry/FusionAuditLog';

export interface SatelliteObservation {
  satId: string;
  position: [number, number, number]; // X, Y, Z en ECEF (m)
  pseudorange: number; // in meters
  carrierPhase?: number; // Optional for future RTK/PPK
  signalStrength?: number; // Signal-to-Noise ratio
  constellation?: 'GPS' | 'GLONASS' | 'GALILEO' | 'BEIDOU';
}

export interface PositionEstimate {
  receiverECEF: [number, number, number]; // X, Y, Z in ECEF (m)
  latLonAlt: [number, number, number];    // [lat, lon, alt] in degrees and meters
  dop: {
    pdop: number; // Position Dilution of Precision
    hdop: number; // Horizontal DOP
    vdop: number; // Vertical DOP
    gdop: number; // Geometric DOP
  };
  covariance: number[][]; // 4x4 covariance matrix [x, y, z, dt]
  residuals: number[];    // Residuals for each observation
  iterations: number;     // Number of iterations performed
  timestamp: number;      // UTC timestamp in milliseconds
  satellitesUsed: number; // Number of satellites used in solution
  solutionStatus: 'VALID' | 'DEGRADED' | 'INVALID';
  errorEstimate?: number; // Estimated position error in meters
}

export class PositionSolver {
  private static readonly SPEED_OF_LIGHT = 299792458; // m/s
  private static readonly MAX_ITERATIONS = 20;
  private static readonly CONVERGENCE_THRESHOLD = 1e-4; // meters
  private static readonly MIN_SATELLITES = 4;
  private static readonly MAX_GDOP = 10.0; // Maximum allowed GDOP

  /**
   * Solve for receiver position using weighted least squares
   * @param observations Array of satellite observations
   * @param initialGuess Optional initial position guess [x, y, z, dt] in meters and seconds
   */
  public static solve(
    observations: SatelliteObservation[],
    initialGuess: [number, number, number, number] = [0, 0, 0, 0]
  ): PositionEstimate {
    if (observations.length < PositionSolver.MIN_SATELLITES) {
      throw new Error(`At least ${PositionSolver.MIN_SATELLITES} satellites required`);
    }

    // Sort observations by signal strength (strongest first)
    const sortedObs = [...observations].sort((a, b) => 
      (b.signalStrength || 0) - (a.signalStrength || 0)
    );

    // Initial state: [x, y, z, dt]
    let state = [...initialGuess] as [number, number, number, number];
    let residuals: number[] = [];
    let H: number[][] = [];
    let weights: number[] = [];
    let iteration = 0;

    // Weighted Least Squares Iteration
    for (; iteration < PositionSolver.MAX_ITERATIONS; iteration++) {
      H = [];
      residuals = [];
      weights = [];
      
      // Build observation matrix and residuals
      for (const obs of sortedObs) {
        const [sx, sy, sz] = obs.position;
        const [x, y, z, dt] = state;
        
        // Calculate geometric range
        const dx = x - sx;
        const dy = y - sy;
        const dz = z - sz;
        const rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Residual = observed - calculated
        const residual = obs.pseudorange - (rho + PositionSolver.SPEED_OF_LIGHT * dt);
        residuals.push(residual);
        
        // Observation matrix row
        H.push([dx/rho, dy/rho, dz/rho, PositionSolver.SPEED_OF_LIGHT]);
        
        // Weight based on elevation angle and signal strength
        const elevation = this.calculateElevation(obs.position, state);
        const weight = this.calculateWeight(elevation, obs.signalStrength);
        weights.push(weight);
      }

      // Apply weights
      const W = math.diag(weights) as math.Matrix;
      const Hmat = math.matrix(H);
      const Ht = math.transpose(Hmat);
      const HtW = math.multiply(Ht, W);
      
      try {
        // Solve: (H^T * W * H) * dx = H^T * W * residuals
        const HtWH = math.multiply(HtW, Hmat);
        const HtWr = math.multiply(
          HtW, 
          math.matrix(residuals.map(r => [r]))
        );
        
        const dx = math.lusolve(HtWH, HtWr) as math.Matrix;
        const dxArray = dx.toArray() as number[][];
        
        // Update state
        for (let i = 0; i < 4; i++) {
          state[i] += dxArray[i][0];
        }
        
        // Check convergence
        if (math.norm(math.matrix(dxArray)) < PositionSolver.CONVERGENCE_THRESHOLD) {
          break;
        }
      } catch (error) {
        console.error('Matrix inversion failed:', error);
        throw new Error('Position solution failed - singular matrix');
      }
    }

    // Calculate DOP and covariance
    const [pdop, hdop, vdop, gdop] = this.calculateDOP(H);
    const covariance = this.calculateCovariance(H, weights, residuals);
    
    // Convert to geographic coordinates
    const [lat, lon, alt] = CoordinateSystemManager.fromECEF(
      state[0], state[1], state[2]
    );

    // Calculate solution status
    let solutionStatus: 'VALID' | 'DEGRADED' | 'INVALID' = 'VALID';
    if (gdop > PositionSolver.MAX_GDOP) {
      solutionStatus = 'DEGRADED';
    }
    if (iteration >= PositionSolver.MAX_ITERATIONS) {
      solutionStatus = 'DEGRADED';
    }

    // Log the solution
    FusionAuditLog.logPositionSolution({
      timestamp: Date.now(),
      position: [state[0], state[1], state[2]],
      dop: { pdop, hdop, vdop, gdop },
      satellitesUsed: observations.length,
      solutionStatus,
      residuals
    });

    return {
      receiverECEF: [state[0], state[1], state[2]],
      latLonAlt: [lat, lon, alt],
      dop: { pdop, hdop, vdop, gdop },
      covariance,
      residuals,
      iterations: iteration + 1,
      timestamp: Date.now(),
      satellitesUsed: observations.length,
      solutionStatus,
      errorEstimate: gdop * this.calculateErrorEstimate(residuals)
    };
  }

  /**
   * Calculate elevation angle of satellite relative to receiver
   */
  private static calculateElevation(
    satPos: [number, number, number],
    receiverPos: [number, number, number, number]
  ): number {
    const [dx, dy, dz] = [
      satPos[0] - receiverPos[0],
      satPos[1] - receiverPos[1],
      satPos[2] - receiverPos[2]
    ];
    
    const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const sinEl = (dx*receiverPos[0] + dy*receiverPos[1] + dz*receiverPos[2]) / 
                 (r * Math.sqrt(receiverPos[0]**2 + receiverPos[1]**2 + receiverPos[2]**2));
    
    return Math.asin(sinEl) * 180 / Math.PI; // Convert to degrees
  }

  /**
   * Calculate observation weight based on elevation and signal strength
   */
  private static calculateWeight(
    elevationDeg: number,
    signalStrength?: number
  ): number {
    // Elevation-based weight (higher elevation = better)
    const elevationRad = (elevationDeg * Math.PI) / 180;
    const elevationWeight = Math.sin(elevationRad) ** 2;
    
    // Signal strength weight (if available)
    const snrWeight = signalStrength 
      ? Math.min(1, signalStrength / 50) // Normalize to 0-1 range
      : 0.5; // Default weight if no signal info
    
    return elevationWeight * (0.5 + snrWeight * 0.5);
  }

  /**
   * Calculate Dilution of Precision (DOP) values
   */
  private static calculateDOP(H: number[][]): [number, number, number, number] {
    try {
      const HtH = math.multiply(math.transpose(H), H);
      const Q = math.inv(HtH) as math.Matrix;
      const q = Q.toArray() as number[][];
      
      // Extract DOP values from covariance matrix
      const q11 = q[0][0];
      const q22 = q[1][1];
      const q33 = q[2][2];
      const q44 = q[3][3];
      
      const pdop = Math.sqrt(q11 + q22 + q33);
      const hdop = Math.sqrt(q11 + q22);
      const vdop = Math.sqrt(q33);
      const gdop = Math.sqrt(q11 + q22 + q33 + q44);
      
      return [pdop, hdop, vdop, gdop];
    } catch (error) {
      console.error('DOP calculation failed:', error);
      return [Infinity, Infinity, Infinity, Infinity];
    }
  }

  /**
   * Calculate error covariance matrix
   */
  private static calculateCovariance(
    H: number[][],
    weights: number[],
    residuals: number[]
  ): number[][] {
    try {
      const m = H.length; // Number of observations
      const n = 4; // Number of parameters (x,y,z,dt)
      
      if (m <= n) {
        return Array(n).fill(0).map(() => Array(n).fill(0));
      }
      
      // Calculate variance of unit weight
      const v = math.matrix(residuals);
      const vt = math.transpose(v);
      const vtv = math.multiply(vt, v);
      const sigma02 = Number(vtv) / (m - n);
      
      // Calculate covariance matrix
      const Hmat = math.matrix(H);
      const Ht = math.transpose(Hmat);
      const HtH = math.multiply(Ht, Hmat);
      const Qxx = math.inv(HtH) as math.Matrix;
      
      // Scale by variance of unit weight
      const C = math.multiply(sigma02, Qxx);
      
      return C.toArray() as number[][];
    } catch (error) {
      console.error('Covariance calculation failed:', error);
      return Array(4).fill(0).map(() => Array(4).fill(0));
    }
  }

  /**
   * Estimate position error from residuals
   */
  private static calculateErrorEstimate(residuals: number[]): number {
    if (residuals.length === 0) return 0;
    
    // Calculate RMS of residuals
    const sumSq = residuals.reduce((sum, r) => sum + r * r, 0);
    return Math.sqrt(sumSq / residuals.length);
  }

  /**
   * Convert position estimate to GeoJSON Point
   */
  public static toGeoJSON(estimate: PositionEstimate): GeoJSON.Feature<GeoJSON.Point> {
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          estimate.latLonAlt[1], // lon
          estimate.latLonAlt[0]  // lat
        ]
      },
      properties: {
        altitude: estimate.latLonAlt[2],
        dop: estimate.dop,
        satellites: estimate.satellitesUsed,
        timestamp: estimate.timestamp,
        errorEstimate: estimate.errorEstimate
      }
    };
  }
}
