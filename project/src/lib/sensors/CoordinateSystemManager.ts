import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { get as getProjection } from 'ol/proj';
import { Extent } from 'ol/extent';

// Register proj4 with OpenLayers
proj4.defs([
  // WGS84 - World Geodetic System 1984 (GPS)
  ['EPSG:4326', '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees'],
  
  // UTM Zones - Example for Zone 32N (Europe)
  ['EPSG:32632', '+proj=utm +zone=32 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'],
  
  // UTM Zone 33N - Africa (Cameroun, Gabon, etc.)
  ['EPSG:32633', '+proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'],
  
  // Lambert 93 - France
  ['EPSG:2154', '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  
  // UTM Zone 33S - Southern Africa
  ['EPSG:32733', '+proj=utm +zone=33 +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs'],
  
  // Cameroun - UTM Zone 32N (West) & 33N (East)
  ['EPSG:32632_CAM_WEST', '+proj=utm +zone=32 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'],
  ['EPSG:32633_CAM_EAST', '+proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'],
  
  // Custom projections can be added here
]);

// Register projections with OpenLayers
register(proj4);

// Define projection extents (useful for map display)
const projectionExtents: Record<string, Extent> = {
  'EPSG:4326': [-180, -90, 180, 90],
  'EPSG:32632': [166021.44, 0.0, 833978.55, 9329005.18],
  'EPSG:32633': [166021.44, 0.0, 833978.55, 9329005.18],
  'EPSG:2154': [-378305.81, 6093283.21, 1212610.74, 7186901.82],
  'EPSG:32632_CAM_WEST': [166021.44, 0.0, 833978.55, 9329005.18],
  'EPSG:32633_CAM_EAST': [166021.44, 0.0, 833978.55, 9329005.18],
};

type Coordinate2D = [number, number];
type Coordinate3D = [number, number, number];
type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ?: number;
  maxZ?: number;
};

interface ProjectionInfo {
  code: string;
  name: string;
  unit: string;
  areaOfUse: string;
  bbox: BoundingBox;
  isGeographic: boolean;
  isProjected: boolean;
}

class CoordinateSystemManager {
  /**
   * Convert coordinates from any projection to WGS84 (EPSG:4326)
   */
  static toWGS84(
    x: number,
    y: number,
    sourceEpsg: string,
    z?: number
  ): { lat: number; lon: number; alt?: number } {
    this.ensureProjectionDefined(sourceEpsg);
    
    const proj = proj4(sourceEpsg, 'EPSG:4326');
    const [lon, lat] = proj.forward([x, y]);
    
    return z !== undefined ? { lat, lon, alt: z } : { lat, lon };
  }

  /**
   * Convert coordinates from WGS84 (EPSG:4326) to any projection
   */
  static fromWGS84(
    lat: number,
    lon: number,
    targetEpsg: string,
    alt?: number
  ): { x: number; y: number; z?: number } {
    this.ensureProjectionDefined(targetEpsg);
    
    const proj = proj4('EPSG:4326', targetEpsg);
    const [x, y] = proj.forward([lon, lat]);
    
    return alt !== undefined ? { x, y, z: alt } : { x, y };
  }

  /**
   * Direct conversion between any two coordinate systems
   */
  static convert(
    x: number,
    y: number,
    fromEpsg: string,
    toEpsg: string,
    z?: number
  ): { x: number; y: number; z?: number } {
    this.ensureProjectionDefined(fromEpsg);
    this.ensureProjectionDefined(toEpsg);
    
    const proj = proj4(fromEpsg, toEpsg);
    const [newX, newY] = proj.forward([x, y]);
    
    return z !== undefined ? { x: newX, y: newY, z } : { x: newX, y: newY };
  }

  /**
   * Get projection information
   */
  static getProjectionInfo(epsg: string): ProjectionInfo | null {
    if (!proj4.defs[epsg]) return null;
    
    const def = proj4.defs[epsg];
    const olProj = getProjection(epsg);
    
    return {
      code: epsg,
      name: this.getProjectionName(epsg),
      unit: olProj?.getUnits() || 'degrees',
      areaOfUse: this.getAreaOfUse(epsg),
      bbox: this.getBoundingBox(epsg),
      isGeographic: olProj?.isGlobal() || false,
      isProjected: olProj?.isProjection() || false,
    };
  }

  /**
   * List all supported projections with their details
   */
  static listSupportedProjections(): ProjectionInfo[] {
    return Object.keys(proj4.defs)
      .map(epsg => this.getProjectionInfo(epsg))
      .filter((info): info is ProjectionInfo => info !== null);
  }

  /**
   * Find the best UTM zone for a given WGS84 coordinate
   */
  static findBestUTMZone(lon: number, lat: number): string {
    // UTM zones are 6 degrees wide, starting at -180
    let zone = Math.floor((lon + 180) / 6) + 1;
    
    // Handle special cases for Norway and Svalbard
    if (lat >= 56.0 && lat < 64.0 && lon >= 3.0 && lon < 12.0) {
      zone = 32;
    }
    
    // Special zones for Svalbard
    if (lat >= 72.0 && lat < 84.0) {
      if (lon >= 0.0 && lon < 9.0) zone = 31;
      else if (lon >= 9.0 && lon < 21.0) zone = 33;
      else if (lon >= 21.0 && lon < 33.0) zone = 35;
      else if (lon >= 33.0 && lon < 42.0) zone = 37;
    }
    
    const hemisphere = lat >= 0 ? 'N' : 'S';
    return `EPSG:326${zone}${hemisphere === 'S' ? '7' : '6'}${zone}`;
  }

  /**
   * Check if a point is within a bounding box
   */
  static isInBoundingBox(
    x: number,
    y: number,
    bbox: BoundingBox,
    epsg?: string
  ): boolean {
    let pointX = x;
    let pointY = y;
    
    // Convert point to the same CRS as bbox if needed
    if (epsg && epsg !== 'EPSG:4326') {
      const wgs84 = this.toWGS84(x, y, epsg);
      pointX = wgs84.lon;
      pointY = wgs84.lat;
    }
    
    return (
      pointX >= bbox.minX &&
      pointX <= bbox.maxX &&
      pointY >= bbox.minY &&
      pointY <= bbox.maxY
    );
  }

  /**
   * Calculate distance between two points in meters
   */
  static calculateDistance(
    coord1: { x: number; y: number; z?: number },
    coord2: { x: number; y: number; z?: number },
    epsg: string = 'EPSG:4326'
  ): number {
    // Convert to WGS84 if needed
    let point1 = { ...coord1 };
    let point2 = { ...coord2 };
    
    if (epsg !== 'EPSG:4326') {
      const wgs1 = this.toWGS84(coord1.x, coord1.y, epsg);
      const wgs2 = this.toWGS84(coord2.x, coord2.y, epsg);
      point1 = { x: wgs1.lon, y: wgs1.lat };
      point2 = { x: wgs2.lon, y: wgs2.lat };
    }
    
    // Haversine formula for great-circle distance
    const R = 6371e3; // Earth radius in meters
    const φ1 = (point1.y * Math.PI) / 180;
    const φ2 = (point2.y * Math.PI) / 180;
    const Δφ = ((point2.y - point1.y) * Math.PI) / 180;
    const Δλ = ((point2.x - point1.x) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Calculate 3D distance if Z coordinates are provided
    if (point1.z !== undefined && point2.z !== undefined) {
      const d = R * c; // 2D distance in meters
      const dz = Math.abs((point2.z || 0) - (point1.z || 0));
      return Math.sqrt(d * d + dz * dz);
    }

    return R * c; // 2D distance in meters
  }

  /**
   * Add a custom projection
   */
  static addCustomProjection(
    epsg: string,
    proj4def: string,
    bbox?: Extent
  ): void {
    if (proj4.defs[epsg]) {
      console.warn(`Projection ${epsg} is already defined. Overwriting...`);
    }
    
    proj4.defs(epsg, proj4def);
    
    if (bbox) {
      projectionExtents[epsg] = bbox;
    }
    
    // Register with OpenLayers
    register(proj4);
  }

  private static ensureProjectionDefined(epsg: string): void {
    if (!proj4.defs[epsg]) {
      throw new Error(`Projection ${epsg} is not defined.`);
    }
  }

  private static getProjectionName(epsg: string): string {
    const names: Record<string, string> = {
      'EPSG:4326': 'WGS 84 (Latitude/Longitude)',
      'EPSG:3857': 'Web Mercator',
      'EPSG:2154': 'RGF93 / Lambert-93',
      'EPSG:32632': 'WGS 84 / UTM zone 32N',
      'EPSG:32633': 'WGS 84 / UTM zone 33N',
      'EPSG:32733': 'WGS 84 / UTM zone 33S',
      'EPSG:32632_CAM_WEST': 'WGS 84 / UTM zone 32N (Cameroon West)',
      'EPSG:32633_CAM_EAST': 'WGS 84 / UTM zone 33N (Cameroon East)',
    };
    
    return names[epsg] || epsg;
  }

  private static getAreaOfUse(epsg: string): string {
    const areas: Record<string, string> = {
      'EPSG:4326': 'World',
      'EPSG:3857': 'World between 85.06°S and 85.06°N',
      'EPSG:2154': 'France - mainland onshore',
      'EPSG:32632': 'Between 6°E and 12°E, northern hemisphere',
      'EPSG:32633': 'Between 12°E and 18°E, northern hemisphere',
      'EPSG:32733': 'Between 12°E and 18°E, southern hemisphere',
      'EPSG:32632_CAM_WEST': 'Cameroon - west of 12°E',
      'EPSG:32633_CAM_EAST': 'Cameroon - east of 12°E',
    };
    
    return areas[epsg] || 'Not specified';
  }

  private static getBoundingBox(epsg: string): BoundingBox {
    const bbox = projectionExtents[epsg] || [-180, -90, 180, 90];
    return {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
    };
  }
}

export { CoordinateSystemManager };

// Helper function to get a projection's extent in meters
function getProjectionExtent(epsg: string): Extent | null {
  const olProj = getProjection(epsg);
  if (!olProj) return null;
  
  const extent = olProj.getExtent();
  if (!extent) return null;
  
  // Convert to meters if needed
  if (olProj.getUnits() === 'degrees') {
    // Rough conversion for display purposes
    const toMeters = 111320; // Approximate meters per degree
    return [
      extent[0] * toMeters,
      extent[1] * toMeters,
      extent[2] * toMeters,
      extent[3] * toMeters,
    ];
  }
  
  return extent;
}
