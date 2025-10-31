import { Feature, Point, Polygon, Position } from 'geojson';
import proj4 from 'proj4';
import { v4 as uuidv4 } from 'uuid';
import { FusionAuditLog } from '../audit/FusionAuditLog';
import { realtimeBridge } from '../realtime/RealtimeBridge';

export type SpatialPoint = {
  lat: number;
  lon: number;
  value: number;
  timestamp?: number;
  metadata?: Record<string, any>;
};

export type HeatmapCell = {
  id: string;
  center: [number, number];
  density: number;
  bounds: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
};

export type AnomalyType = 'position' | 'geometry' | 'validation' | 'density' | 'temporal';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  location: [number, number];
  severity: number; // 0-1 scale
  confidence: number; // 0-1 scale
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
  relatedFeatures?: string[];
}

type SpatialIndex = {
  [key: string]: {
    points: SpatialPoint[];
    bounds: {
      minLat: number;
      minLon: number;
      maxLat: number;
      maxLon: number;
    };
  };
};

export class AnalyticsEngine {
  private static instance: AnalyticsEngine;
  private spatialIndex: SpatialIndex = {};
  private auditLog = FusionAuditLog.getInstance();

  private constructor() {
    this.initializeProj4();
  }

  public static getInstance(): AnalyticsEngine {
    if (!AnalyticsEngine.instance) {
      AnalyticsEngine.instance = new AnalyticsEngine();
    }
    return AnalyticsEngine.instance;
  }

  private initializeProj4(): void {
    // Define common projections
    proj4.defs(
      'EPSG:2154',
      '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
    );
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
  }

  /**
   * Compute density heatmap from spatial points
   */
  public computeDensity(
    points: SpatialPoint[],
    cellSize = 0.001,
    bounds?: {
      minLat: number;
      minLon: number;
      maxLat: number;
      maxLon: number;
    }
  ): HeatmapCell[] {
    const grid = new Map<string, HeatmapCell>();
    
    // Calculate bounds if not provided
    const calculatedBounds = bounds || this.calculateBounds(points);
    
    for (const point of points) {
      const latIdx = Math.floor((point.lat - calculatedBounds.minLat) / cellSize);
      const lonIdx = Math.floor((point.lon - calculatedBounds.minLon) / cellSize);
      const key = `${latIdx}_${lonIdx}`;
      
      const cellLat = calculatedBounds.minLat + latIdx * cellSize;
      const cellLon = calculatedBounds.minLon + lonIdx * cellSize;
      
      const cell = grid.get(key) || {
        id: `cell_${key}`,
        center: [
          cellLat + cellSize / 2,
          cellLon + cellSize / 2
        ] as [number, number],
        density: 0,
        bounds: {
          minLat: cellLat,
          minLon: cellLon,
          maxLat: cellLat + cellSize,
          maxLon: cellLon + cellSize
        }
      };
      
      cell.density += 1;
      grid.set(key, cell);
    }
    
    return Array.from(grid.values());
  }

  /**
   * Detect spatial anomalies using statistical methods
   */
  public detectAnomalies(
    points: SpatialPoint[],
    options: {
      method?: 'zscore' | 'iqr' | 'dbscan';
      threshold?: number;
      minSamples?: number;
      eps?: number;
    } = {}
  ): Anomaly[] {
    const {
      method = 'zscore',
      threshold = 3,
      minSamples = 5,
      eps = 0.01
    } = options;

    if (points.length < minSamples) {
      return [];
    }

    const anomalies: Anomaly[] = [];
    const timestamp = Date.now();

    switch (method) {
      case 'zscore':
        const values = points.map(p => p.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(
          values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length
        );

        points.forEach((point, index) => {
          const zScore = Math.abs(point.value - mean) / (std || 1);
          if (zScore > threshold) {
            anomalies.push({
              id: `anomaly_${timestamp}_${index}`,
              type: 'position',
              location: [point.lat, point.lon],
              severity: Math.min(1, zScore / 5), // Cap severity at 1
              confidence: 0.9 - 0.1 / (zScore + 1), // Higher z-score = higher confidence
              message: `Anomalie détectée : valeur ${point.value.toFixed(2)} (${zScore.toFixed(1)}σ)`,
              timestamp: point.timestamp || timestamp,
              metadata: {
                method: 'zscore',
                zScore: parseFloat(zScore.toFixed(2)),
                value: point.value,
                mean: parseFloat(mean.toFixed(2)),
                std: parseFloat(std.toFixed(2)),
                ...point.metadata
              }
            });
          }
        });
        break;

      case 'iqr':
        // IQR method for anomaly detection
        const sorted = [...points].sort((a, b) => a.value - b.value);
        const q1 = this.quantile(sorted.map(p => p.value), 0.25);
        const q3 = this.quantile(sorted.map(p => p.value), 0.75);
        const iqr = q3 - q1;
        const lowerBound = q1 - threshold * iqr;
        const upperBound = q3 + threshold * iqr;

        points.forEach((point, index) => {
          if (point.value < lowerBound || point.value > upperBound) {
            const severity = point.value > upperBound
              ? (point.value - upperBound) / (upperBound * 2)
              : (lowerBound - point.value) / (Math.abs(lowerBound) * 2);

            anomalies.push({
              id: `anomaly_${timestamp}_${index}`,
              type: 'position',
              location: [point.lat, point.lon],
              severity: Math.min(1, severity),
              confidence: 0.85,
              message: `Valeur hors limites : ${point.value.toFixed(2)} (${point.value < lowerBound ? 'sous' : 'au-dessus'} des limites)`,
              timestamp: point.timestamp || timestamp,
              metadata: {
                method: 'iqr',
                value: point.value,
                q1: parseFloat(q1.toFixed(2)),
                q3: parseFloat(q3.toFixed(2)),
                iqr: parseFloat(iqr.toFixed(2)),
                bounds: [lowerBound, upperBound],
                ...point.metadata
              }
            });
          }
        });
        break;

      case 'dbscan':
        // Simple DBSCAN implementation for spatial clustering
        const clusters = this.dbscan(points, eps, minSamples);
        const noisePoints = clusters.filter(c => c.length === 1).flat();
        
        noisePoints.forEach((point, index) => {
          anomalies.push({
            id: `anomaly_${timestamp}_${index}`,
            type: 'position',
            location: [point.lat, point.lon],
            severity: 0.7, // Moderate severity for noise points
            confidence: 0.8,
            message: 'Point isolé détecté',
            timestamp: point.timestamp || timestamp,
            metadata: {
              method: 'dbscan',
              eps,
              minSamples,
              ...point.metadata
            }
          });
        });
        break;
    }

    // Log the detection
    if (anomalies.length > 0) {
      this.auditLog.logEvent({
        type: 'anomaly_detection',
        userId: 'system',
        entityType: 'spatial_analysis',
        entityId: `batch_${timestamp}`,
        metadata: {
          method,
          threshold,
          pointsAnalyzed: points.length,
          anomaliesDetected: anomalies.length,
          anomalyTypes: [...new Set(anomalies.map(a => a.type))]
        }
      });

      // Notify about critical anomalies
      const criticalAnomalies = anomalies.filter(a => a.severity > 0.8);
      if (criticalAnomalies.length > 0) {
        realtimeBridge.broadcast('anomaly', {
          type: 'critical_anomalies',
          count: criticalAnomalies.length,
          maxSeverity: Math.max(...criticalAnomalies.map(a => a.severity)),
          location: criticalAnomalies[0].location
        }, 'system', 'analytics_engine');
      }
    }

    return anomalies;
  }

  /**
   * Interpolate values using Inverse Distance Weighting (IDW)
   */
  public interpolateIDW(
    points: SpatialPoint[],
    target: [number, number],
    options: {
      power?: number;
      maxDistance?: number;
      minPoints?: number;
    } = {}
  ): number | null {
    const { power = 2, maxDistance = 0.1, minPoints = 3 } = options;
    
    // Filter points within maxDistance
    const nearbyPoints = points.filter(p => {
      const d = this.haversineDistance([p.lat, p.lon], target);
      return d <= maxDistance;
    });

    if (nearbyPoints.length < minPoints) {
      return null; // Not enough points for reliable interpolation
    }

    let numerator = 0;
    let denominator = 0;
    let totalWeight = 0;

    for (const point of nearbyPoints) {
      const d = this.haversineDistance([point.lat, point.lon], target);
      // Avoid division by zero
      if (d === 0) return point.value;
      
      const w = 1 / Math.pow(d, power);
      numerator += w * point.value;
      denominator += w;
      totalWeight += w;
    }

    return numerator / denominator;
  }

  /**
   * Calculate spatial statistics for a set of points
   */
  public calculateSpatialStats(points: SpatialPoint[]) {
    if (points.length === 0) return null;

    const values = points.map(p => p.value);
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    
    // Basic statistics
    const mean = this.mean(values);
    const std = this.standardDeviation(values, mean);
    
    // Spatial statistics
    const centroid = this.calculateCentroid(points);
    const stdDistance = this.standardDistance(points, centroid);
    
    return {
      count: points.length,
      mean: parseFloat(mean.toFixed(4)),
      std: parseFloat(std.toFixed(4)),
      min: Math.min(...values),
      max: Math.max(...values),
      centroid,
      stdDistance: parseFloat(stdDistance.toFixed(4)),
      bounds: this.calculateBounds(points),
      temporalRange: points[0].timestamp && points[points.length - 1].timestamp 
        ? [points[0].timestamp, points[points.length - 1].timestamp] 
        : null
    };
  }

  /**
   * Calculate the standard distance (spatial standard deviation)
   */
  private standardDistance(points: SpatialPoint[], centroid: [number, number]): number {
    if (points.length === 0) return 0;
    
    let sumSqDiff = 0;
    for (const point of points) {
      const dx = this.haversineDistance([point.lat, centroid[1]], centroid);
      const dy = this.haversineDistance([centroid[0], point.lon], centroid);
      sumSqDiff += dx * dx + dy * dy;
    }
    
    return Math.sqrt(sumSqDiff / points.length);
  }

  /**
   * Simple DBSCAN clustering implementation
   */
  private dbscan(
    points: SpatialPoint[],
    eps: number,
    minPts: number
  ): SpatialPoint[][] {
    const clusters: SpatialPoint[][] = [];
    const visited = new Set<number>();
    const noise = new Set<number>();
    
    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      
      visited.add(i);
      const neighbors = this.regionQuery(points, i, eps);
      
      if (neighbors.length < minPts) {
        noise.add(i);
      } else {
        const cluster: SpatialPoint[] = [points[i]];
        this.expandCluster(points, neighbors, cluster, visited, noise, eps, minPts);
        clusters.push(cluster);
      }
    }
    
    // Add noise points as individual clusters
    noise.forEach(idx => clusters.push([points[idx]]));
    
    return clusters;
  }

  private expandCluster(
    points: SpatialPoint[],
    neighbors: number[],
    cluster: SpatialPoint[],
    visited: Set<number>,
    noise: Set<number>,
    eps: number,
    minPts: number
  ): void {
    for (let i = 0; i < neighbors.length; i++) {
      const pointIdx = neighbors[i];
      
      if (!visited.has(pointIdx)) {
        visited.add(pointIdx);
        const newNeighbors = this.regionQuery(points, pointIdx, eps);
        
        if (newNeighbors.length >= minPts) {
          neighbors.push(...newNeighbors.filter(n => !neighbors.includes(n)));
        }
      }
      
      if (!cluster.includes(points[pointIdx]) && !noise.has(pointIdx)) {
        cluster.push(points[pointIdx]);
      }
    }
  }

  private regionQuery(
    points: SpatialPoint[], 
    pointIdx: number, 
    eps: number
  ): number[] {
    const neighbors: number[] = [];
    const point = points[pointIdx];
    
    for (let i = 0; i < points.length; i++) {
      if (i === pointIdx) continue;
      
      const distance = this.haversineDistance(
        [point.lat, point.lon],
        [points[i].lat, points[i].lon]
      );
      
      if (distance <= eps) {
        neighbors.push(i);
      }
    }
    
    return neighbors;
  }

  private haversineDistance(
    coord1: [number, number],
    coord2: [number, number]
  ): number {
    const [lat1, lon1] = coord1;
    const [lat2, lon2] = coord2;
    
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateCentroid(points: SpatialPoint[]): [number, number] {
    if (points.length === 0) return [0, 0];
    
    let sumLat = 0;
    let sumLon = 0;
    
    for (const point of points) {
      sumLat += point.lat;
      sumLon += point.lon;
    }
    
    return [sumLat / points.length, sumLon / points.length];
  }

  private calculateBounds(points: SpatialPoint[]) {
    if (points.length === 0) {
      return {
        minLat: 0,
        minLon: 0,
        maxLat: 0,
        maxLon: 0
      };
    }
    
    return {
      minLat: Math.min(...points.map(p => p.lat)),
      minLon: Math.min(...points.map(p => p.lon)),
      maxLat: Math.max(...points.map(p => p.lat)),
      maxLon: Math.max(...points.map(p => p.lon))
    };
  }

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private standardDeviation(values: number[], mean: number): number {
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  private quantile(values: number[], q: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
      return sorted[base];
    }
  }
}

// Singleton instance
export const analyticsEngine = AnalyticsEngine.getInstance();
