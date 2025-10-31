import { CalibrationProfile, calibrationProfiles } from './CalibrationProtocol';
import type { GNSSData, FusedPosition } from './SensorFusion';

/**
 * Interface for parsed NMEA data
 */
interface NMEAData {
  type: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  course?: number;
  satellites?: number;
  hdop?: number;
  vdop?: number;
  pdop?: number;
  fixQuality?: number;
  geoidHeight?: number;
  ageOfDgpsData?: number;
  dgpsStationId?: string;
}

/**
 * Interface for RTCM message header
 */
interface RTCMMessageHeader {
  type: number;
  length: number;
  crc: number;
  valid: boolean;
}

/**
 * Interface for GPX track point
 */
interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
  course?: number;
  speed?: number;
  hdop?: number;
  vdop?: number;
  pdop?: number;
  sat?: number;
}

/**
 * GNSS format manager for parsing and converting between different GNSS data formats
 */
export class GNSSFormatManager {
  /**
   * Parse NMEA sentence
   */
  static parseNMEA(nmea: string): NMEAData | null {
    if (!nmea.startsWith('$')) {
      return null;
    }

    // Remove checksum if present
    const sentence = nmea.split('*')[0];
    const parts = sentence.split(',');
    const type = parts[0];

    switch (type) {
      case '$GPGGA': // Global Positioning System Fix Data
        return this.parseGGA(parts);
      case '$GPRMC': // Recommended Minimum Navigation Information
        return this.parseRMC(parts);
      case '$GPGSA': // GPS DOP and active satellites
        return this.parseGSA(parts);
      case '$GPGSV': // GPS Satellites in view
        return this.parseGSV(parts);
      case '$GPVTG': // Track Made Good and Ground Speed
        return this.parseVTG(parts);
      default:
        console.warn(`Unsupported NMEA sentence type: ${type}`);
        return null;
    }
  }

  /**
   * Parse GGA (Global Positioning System Fix Data) sentence
   */
  private static parseGGA(parts: string[]): NMEAData | null {
    if (parts.length < 15) return null;

    const time = parts[1];
    const lat = this.nmeaToDecimal(parts[2], parts[3]);
    const lon = this.nmeaToDecimal(parts[4], parts[5]);
    const fixQuality = parseInt(parts[6], 10);
    const satellites = parseInt(parts[7], 10);
    const hdop = parseFloat(parts[8]);
    const altitude = parseFloat(parts[9]);
    const geoidHeight = parseFloat(parts[11]);
    const ageOfDgpsData = parts[13] ? parseFloat(parts[13]) : undefined;
    const dgpsStationId = parts[14] || undefined;

    return {
      type: 'GGA',
      timestamp: time,
      latitude: lat,
      longitude: lon,
      altitude: !isNaN(altitude) ? altitude : undefined,
      satellites: !isNaN(satellites) ? satellites : undefined,
      hdop: !isNaN(hdop) ? hdop : undefined,
      fixQuality: !isNaN(fixQuality) ? fixQuality : undefined,
      geoidHeight: !isNaN(geoidHeight) ? geoidHeight : undefined,
      ageOfDgpsData: !isNaN(ageOfDgpsData as number) ? ageOfDgpsData : undefined,
      dgpsStationId
    };
  }

  /**
   * Parse RMC (Recommended Minimum Navigation Information) sentence
   */
  private static parseRMC(parts: string[]): NMEAData | null {
    if (parts.length < 12) return null;

    const time = parts[1];
    const status = parts[2];
    const lat = this.nmeaToDecimal(parts[3], parts[4]);
    const lon = this.nmeaToDecimal(parts[5], parts[6]);
    const speed = parts[7] ? parseFloat(parts[7]) * 0.514444 : undefined; // Convert knots to m/s
    const course = parts[8] ? parseFloat(parts[8]) : undefined;
    const date = parts[9];

    // Skip if no valid fix
    if (status !== 'A') return null;

    // Combine date and time into ISO format
    const dateTime = date && time
      ? `20${date.slice(4, 6)}-${date.slice(2, 4)}-${date.slice(0, 2)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`
      : new Date().toISOString();

    return {
      type: 'RMC',
      timestamp: dateTime,
      latitude: lat,
      longitude: lon,
      speed: !isNaN(speed as number) ? speed : undefined,
      course: !isNaN(course as number) ? course : undefined
    };
  }

  /**
   * Parse GSA (GPS DOP and active satellites) sentence
   */
  private static parseGSA(parts: string[]): NMEAData | null {
    if (parts.length < 17) return null;

    return {
      type: 'GSA',
      timestamp: new Date().toISOString(),
      pdop: parseFloat(parts[15]),
      hdop: parseFloat(parts[16]),
      vdop: parseFloat(parts[17])
    };
  }

  /**
   * Parse GSV (GPS Satellites in view) sentence
   */
  private static parseGSV(parts: string[]): NMEAData | null {
    if (parts.length < 7) return null;

    return {
      type: 'GSV',
      timestamp: new Date().toISOString(),
      satellites: parseInt(parts[3], 10)
    };
  }

  /**
   * Parse VTG (Track Made Good and Ground Speed) sentence
   */
  private static parseVTG(parts: string[]): NMEAData | null {
    if (parts.length < 9) return null;

    return {
      type: 'VTG',
      timestamp: new Date().toISOString(),
      course: parseFloat(parts[1]),
      speed: parseFloat(parts[7]) / 3.6 // Convert km/h to m/s
    };
  }

  /**
   * Convert NMEA latitude/longitude format to decimal degrees
   */
  private static nmeaToDecimal(coord: string, direction: string): number {
    if (!coord || !direction) return 0;

    // Extract degrees and minutes
    const deg = parseFloat(coord.substring(0, 2));
    const min = parseFloat(coord.substring(2));
    
    // Convert to decimal degrees
    let decimal = deg + min / 60;
    
    // Apply direction (N/S, E/W)
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }

  /**
   * Parse RTCM (Radio Technical Commission for Maritime Services) message
   */
  static parseRTCM(data: ArrayBuffer): { header: RTCMMessageHeader; data: DataView } | null {
    const view = new DataView(data);
    
    // RTCM message format:
    // 8-bit preamble (0xD3)
    // 6-bit reserved (0x00)
    // 10-bit message length (number of bytes following the header, up to 1023)
    // n * 8-bit data bytes
    // 24-bit CRC
    
    // Check minimum length (preamble + reserved + length + crc = 5 bytes)
    if (view.byteLength < 5) return null;
    
    // Check preamble
    if (view.getUint8(0) !== 0xD3) return null;
    
    // Extract message length (10 bits starting at bit 6)
    const length = ((view.getUint8(1) & 0x03) << 8) | view.getUint8(2);
    
    // Verify message length
    if (view.byteLength < length + 6) return null; // +6 for header and CRC
    
    // Extract CRC (last 3 bytes)
    const crc = (view.getUint8(length + 3) << 16) |
                (view.getUint8(length + 4) << 8) |
                view.getUint8(length + 5);
    
    // TODO: Implement CRC verification
    
    return {
      header: {
        type: view.getUint8(3),
        length,
        crc,
        valid: true // TODO: Verify CRC
      },
      data: new DataView(data, 3, length + 3) // Include message type byte in data
    };
  }

  /**
   * Parse GPX (GPS Exchange Format) data
   */
  static parseGPX(gpxString: string): GPXPoint[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxString, 'text/xml');
    const points: GPXPoint[] = [];
    
    // Check for parsing errors
    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      throw new Error('Invalid GPX format');
    }
    
    // Find all track points
    const trkpts = xmlDoc.getElementsByTagName('trkpt');
    
    for (let i = 0; i < trkpts.length; i++) {
      const trkpt = trkpts[i];
      const lat = parseFloat(trkpt.getAttribute('lat') || '0');
      const lon = parseFloat(trkpt.getAttribute('lon') || '0');
      
      if (isNaN(lat) || isNaN(lon)) continue;
      
      const point: GPXPoint = { lat, lon };
      
      // Extract elevation if available
      const ele = trkpt.getElementsByTagName('ele')[0]?.textContent;
      if (ele) point.ele = parseFloat(ele);
      
      // Extract time if available
      const time = trkpt.getElementsByTagName('time')[0]?.textContent;
      if (time) point.time = time;
      
      // Extract extensions if available
      const extensions = trkpt.getElementsByTagName('extensions')[0];
      if (extensions) {
        // Check for common extension formats
        const course = extensions.getElementsByTagName('course')[0]?.textContent;
        if (course) point.course = parseFloat(course);
        
        const speed = extensions.getElementsByTagName('speed')[0]?.textContent;
        if (speed) point.speed = parseFloat(speed);
        
        const hdop = extensions.getElementsByTagName('hdop')[0]?.textContent;
        if (hdop) point.hdop = parseFloat(hdop);
        
        const vdop = extensions.getElementsByTagName('vdop')[0]?.textContent;
        if (vdop) point.vdop = parseFloat(vdop);
        
        const pdop = extensions.getElementsByTagName('pdop')[0]?.textContent;
        if (pdop) point.pdop = parseFloat(pdop);
        
        const sat = extensions.getElementsByTagName('sat')[0]?.textContent;
        if (sat) point.sat = parseInt(sat, 10);
      }
      
      points.push(point);
    }
    
    return points;
  }

  /**
   * Convert GNSSData to NMEA GGA sentence
   */
  static toNMEAGGA(data: GNSSData): string {
    const toNmeaCoord = (coord: number, isLongitude: boolean): string => {
      const absCoord = Math.abs(coord);
      const deg = Math.floor(absCoord);
      const min = (absCoord - deg) * 60;
      const dir = isLongitude ? (coord >= 0 ? 'E' : 'W') : (coord >= 0 ? 'N' : 'S');
      return `${deg.toString().padStart(isLongitude ? 3 : 2, '0')}${min.toFixed(4).padStart(7, '0')},${dir}`;
    };
    
    const now = new Date();
    const time = [
      now.getUTCHours().toString().padStart(2, '0'),
      now.getUTCMinutes().toString().padStart(2, '0'),
      now.getUTCSeconds().toString().padStart(2, '0'),
      '.',
      now.getUTCMilliseconds().toString().padStart(3, '0').substring(0, 2)
    ].join('');
    
    const latNmea = toNmeaCoord(data.latitude, false);
    const lonNmea = toNmeaCoord(data.longitude, true);
    
    // GGA message parts
    const gga = [
      'GPGGA',
      time,
      latNmea.split(',')[0],
      latNmea.split(',')[1],
      lonNmea.split(',')[0],
      lonNmea.split(',')[1],
      data.fixQuality?.toString() || '1', // Fix quality
      data.satellites?.toString().padStart(2, '0') || '00',
      data.hdop?.toFixed(1) || '1.0',
      (data.altitude || 0).toFixed(1),
      'M', // Altitude units (Meters)
      '0.0', // Height of geoid above WGS84 ellipsoid
      'M', // Geoid height units
      '', // Time since last DGPS update
      '0000' // DGPS reference station ID
    ];
    
    // Calculate checksum
    const sentence = `$${gga.join(',')}`;
    let checksum = 0;
    for (let i = 1; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    
    return `${sentence}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
  }

  /**
   * Convert GNSSData to GPX format
   */
  static toGPX(points: Array<{lat: number; lon: number; alt?: number; time?: Date}>): string {
    const formatTime = (date: Date): string => {
      return date.toISOString();
    };
    
    const gpxPoints = points.map(point => {
      let gpx = `    <trkpt lat="${point.lat}" lon="${point.lon}">\n`;
      
      if (point.alt !== undefined) {
        gpx += `      <ele>${point.alt.toFixed(2)}</ele>\n`;
      }
      
      if (point.time) {
        gpx += `      <time>${formatTime(point.time)}</time>\n`;
      }
      
      gpx += '    </trkpt>';
      return gpx;
    }).join('\n');
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cadastre_IA"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>GNSS Track</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Track</name>
    <trkseg>
${gpxPoints}
    </trkseg>
  </trk>
</gpx>`;
  }

  /**
   * Convert GNSSData to GeoJSON format
   */
  static toGeoJSON(points: Array<{lat: number; lon: number; alt?: number; props?: Record<string, any>}>): string {
    const features = points.map((point, index) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat, point.alt].filter(coord => coord !== undefined)
      },
      properties: {
        ...point.props,
        id: index + 1
      }
    }));
    
    return JSON.stringify({
      type: 'FeatureCollection',
      features
    }, null, 2);
  }

  /**
   * Convert between coordinate formats (DMS, DMM, DD)
   */
  static convertCoordinate(
    value: number | string,
    from: 'DD' | 'DMS' | 'DMM',
    to: 'DD' | 'DMS' | 'DMM',
    isLongitude: boolean = false
  ): string {
    let decimal: number;
    
    // Convert input to decimal degrees
    if (typeof value === 'string') {
      switch (from) {
        case 'DMS': // Degrees, Minutes, Seconds (e.g., 40°26'46"N)
          const dmsMatch = value.match(/(-?\d+)[° ]+(\d+)['′ ]+(\d+(?:\.\d+)?)["'′]?\s*([NSEW]?)/i);
          if (!dmsMatch) throw new Error('Invalid DMS format');
          
          let dmsDeg = parseFloat(dmsMatch[1]);
          const dmsMin = parseFloat(dmsMatch[2]);
          const dmsSec = parseFloat(dmsMatch[3]);
          const dmsDir = dmsMatch[4].toUpperCase();
          
          decimal = dmsDeg + (dmsMin / 60) + (dmsSec / 3600);
          
          if (dmsDir === 'S' || dmsDir === 'W') {
            decimal = -decimal;
          }
          break;
          
        case 'DMM': // Degrees and Decimal Minutes (e.g., 40°26.767' N)
          const dmmMatch = value.match(/(-?\d+)[° ]+(\d+(?:\.\d+)?)['′]?\s*([NSEW]?)/i);
          if (!dmmMatch) throw new Error('Invalid DMM format');
          
          let dmmDeg = parseFloat(dmmMatch[1]);
          const dmmMin = parseFloat(dmmMatch[2]);
          const dmmDir = dmmMatch[3].toUpperCase();
          
          decimal = dmmDeg + (dmmMin / 60);
          
          if (dmmDir === 'S' || dmmDir === 'W') {
            decimal = -decimal;
          }
          break;
          
        case 'DD': // Decimal Degrees
        default:
          const ddMatch = value.match(/(-?\d+(?:\.\d+)?)[°]?\s*([NSEW]?)/i);
          if (!ddMatch) throw new Error('Invalid DD format');
          
          decimal = parseFloat(ddMatch[1]);
          const ddDir = ddMatch[2].toUpperCase();
          
          if ((ddDir === 'S' || ddDir === 'W') && decimal > 0) {
            decimal = -decimal;
          }
          break;
      }
    } else {
      decimal = value;
    }
    
    // Convert from decimal to target format
    switch (to) {
      case 'DMS': // Degrees, Minutes, Seconds
        const absDecimal = Math.abs(decimal);
        const d = Math.floor(absDecimal);
        const m = Math.floor((absDecimal - d) * 60);
        const s = (absDecimal - d - m / 60) * 3600;
        
        let dir = '';
        if (isLongitude) {
          dir = decimal >= 0 ? 'E' : 'W';
        } else {
          dir = decimal >= 0 ? 'N' : 'S';
        }
        
        return `${d}° ${m}' ${s.toFixed(2)}" ${dir}`;
        
      case 'DMM': // Degrees and Decimal Minutes
        const absDmm = Math.abs(decimal);
        const dmmD = Math.floor(absDmm);
        const dmmM = (absDmm - dmmD) * 60;
        
        let dmmDir = '';
        if (isLongitude) {
          dmmDir = decimal >= 0 ? 'E' : 'W';
        } else {
          dmmDir = decimal >= 0 ? 'N' : 'S';
        }
        
        return `${dmmD}° ${dmmM.toFixed(4)}' ${dmmDir}`;
        
      case 'DD': // Decimal Degrees
      default:
        return `${decimal.toFixed(6)}°`;
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  static calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Calculate bearing between two points
   */
  static calculateBearing(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180;
    const λ2 = lon2 * Math.PI / 180;

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    
    let θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360; // in degrees
    
    return bearing;
  }

  /**
   * Convert speed between units
   */
  static convertSpeed(
    value: number,
    from: 'm/s' | 'km/h' | 'knots' | 'mph',
    to: 'm/s' | 'km/h' | 'knots' | 'mph'
  ): number {
    // First convert to m/s
    let metersPerSecond: number;
    
    switch (from) {
      case 'm/s':
        metersPerSecond = value;
        break;
      case 'km/h':
        metersPerSecond = value / 3.6;
        break;
      case 'knots':
        metersPerSecond = value * 0.514444;
        break;
      case 'mph':
        metersPerSecond = value * 0.44704;
        break;
      default:
        throw new Error(`Unsupported speed unit: ${from}`);
    }
    
    // Convert to target unit
    switch (to) {
      case 'm/s':
        return metersPerSecond;
      case 'km/h':
        return metersPerSecond * 3.6;
      case 'knots':
        return metersPerSecond / 0.514444;
      case 'mph':
        return metersPerSecond / 0.44704;
      default:
        throw new Error(`Unsupported speed unit: ${to}`);
    }
  }

  /**
   * Convert distance between units
   */
  static convertDistance(
    value: number,
    from: 'm' | 'km' | 'ft' | 'mi' | 'nmi',
    to: 'm' | 'km' | 'ft' | 'mi' | 'nmi'
  ): number {
    // First convert to meters
    let meters: number;
    
    switch (from) {
      case 'm':
        meters = value;
        break;
      case 'km':
        meters = value * 1000;
        break;
      case 'ft':
        meters = value * 0.3048;
        break;
      case 'mi':
        meters = value * 1609.344;
        break;
      case 'nmi':
        meters = value * 1852;
        break;
      default:
        throw new Error(`Unsupported distance unit: ${from}`);
    }
    
    // Convert to target unit
    switch (to) {
      case 'm':
        return meters;
      case 'km':
        return meters / 1000;
      case 'ft':
        return meters / 0.3048;
      case 'mi':
        return meters / 1609.344;
      case 'nmi':
        return meters / 1852;
      default:
        throw new Error(`Unsupported distance unit: ${to}`);
    }
  }
}
