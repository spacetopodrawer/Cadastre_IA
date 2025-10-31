import { EventEmitter } from 'events';

export class GNSSProcessor extends EventEmitter {
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private isActive = false;
  private nmeaParser: any = null;
  private rtcmParser: any = null;

  constructor() {
    super();
    this.initializeParsers();
  }

  private initializeParsers(): void {
    // Lazy load the NMEA and RTCM parsers
    import('@drivetech/nmea-parser').then(module => {
      this.nmeaParser = new module.default();
    }).catch(error => {
      console.error('Failed to load NMEA parser:', error);
    });

    // Note: RTCM parser would be implemented similarly with a dedicated library
  }

  /**
   * Start receiving GNSS updates
   */
  public start(): void {
    if (this.isActive) return;
    
    if ('geolocation' in navigator) {
      this.isActive = true;
      
      const options: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 5000, // 5 seconds
        timeout: 10000,   // 10 seconds
      };
      
      this.watchId = navigator.geolocation.watchPosition(
        this.handlePositionUpdate.bind(this),
        this.handlePositionError.bind(this),
        options
      );
      
      // Also listen for NMEA data if available
      this.setupNmeaListener();
      
    } else {
      console.warn('Geolocation is not supported by this browser');
    }
  }

  /**
   * Stop receiving GNSS updates
   */
  public stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isActive = false;
    this.removeNmeaListener();
  }

  /**
   * Process raw NMEA data
   */
  public processNmea(nmeaString: string): void {
    if (!this.nmeaParser) {
      console.warn('NMEA parser not initialized');
      return;
    }
    
    try {
      const data = this.nmeaParser.parse(nmeaString);
      
      // Only process GGA and RMC sentences for position
      if (data.sentenceId === 'GGA' || data.sentenceId === 'RMC') {
        const gnssData: GNSSData = {
          latitude: data.lat,
          longitude: data.lon,
          altitude: data.altitude,
          timestamp: Date.now(),
          source: 'NMEA',
          accuracy: data.hdop ? data.hdop * 5 : undefined, // Approximate HDOP to meters
          hdop: data.hdop,
          vdop: data.vdop,
          satellites: data.satellitesInView,
          fixQuality: data.quality,
        };
        
        this.emit('update', gnssData);
      }
    } catch (error) {
      console.error('Error parsing NMEA data:', error);
    }
  }

  /**
   * Process RTCM data
   */
  public processRtcm(rtcmData: ArrayBuffer): void {
    // In a real implementation, this would decode RTCM messages
    // For now, we'll just emit a mock update
    console.log('Processing RTCM data:', rtcmData);
    
    // This would be replaced with actual RTCM parsing
    if (this.lastPosition) {
      const rtcmUpdate: GNSSData = {
        latitude: this.lastPosition.coords.latitude,
        longitude: this.lastPosition.coords.longitude,
        altitude: this.lastPosition.coords.altitude || 0,
        timestamp: Date.now(),
        source: 'RTCM',
        accuracy: 0.02, // RTK accuracy in meters
        hdop: 0.5,
        vdop: 0.8,
        satellites: 12,
        fixQuality: 4, // RTK fixed
      };
      
      this.emit('update', rtcmUpdate);
    }
  }

  /**
   * Handle position updates from the Geolocation API
   */
  private handlePositionUpdate(position: GeolocationPosition): void {
    this.lastPosition = position;
    
    const gnssData: GNSSData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude || undefined,
      timestamp: position.timestamp || Date.now(),
      source: 'GNSS',
      accuracy: position.coords.accuracy,
    };
    
    this.emit('update', gnssData);
  }

  /**
   * Handle position errors
   */
  private handlePositionError(error: GeolocationPositionError): void {
    console.error('Geolocation error:', error);
    this.emit('error', error);
  }

  /**
   * Set up NMEA listener (e.g., from a serial port or WebSocket)
   */
  private setupNmeaListener(): void {
    // In a real implementation, this would set up a listener for NMEA data
    // For example, from a WebSocket or serial port
    
    // Example for WebSocket:
    // const ws = new WebSocket('ws://your-nmea-server:port');
    // ws.onmessage = (event) => this.processNmea(event.data);
  }

  /**
   * Clean up NMEA listener
   */
  private removeNmeaListener(): void {
    // Clean up any listeners
  }

  /**
   * Get the current position
   */
  public getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });
  }

  /**
   * Convert degrees to NMEA format (DDMM.MMMM)
   */
  public static degreesToNmea(degrees: number, isLongitude = false): string {
    const absDegrees = Math.abs(degrees);
    const deg = Math.floor(absDegrees);
    const min = (absDegrees - deg) * 60;
    const direction = isLongitude 
      ? (degrees >= 0 ? 'E' : 'W')
      : (degrees >= 0 ? 'N' : 'S');
    
    // Format: DDDMM.MMMM for longitude, DDMM.MMMM for latitude
    const format = isLongitude ? '0000.0000' : '00.0000';
    const value = (deg * 100 + min).toFixed(4).padStart(9, '0');
    
    return `${value},${direction}`;
  }

  /**
   * Generate NMEA GGA sentence
   */
  public generateGGA(lat: number, lon: number, alt: number): string {
    const now = new Date();
    const time = [
      now.getUTCHours().toString().padStart(2, '0'),
      now.getUTCMinutes().toString().padStart(2, '0'),
      now.getUTCSeconds().toString().padStart(2, '0'),
      '.',
      now.getUTCMilliseconds().toString().padStart(3, '0').slice(0, 2)
    ].join('');
    
    const latNmea = GNSSProcessor.degreesToNmea(lat);
    const lonNmea = GNSSProcessor.degreesToNmea(lon, true);
    
    // GGA: Global Positioning System Fix Data
    const gga = [
      'GPGGA',
      time,
      latNmea.split(',')[0],
      latNmea.split(',')[1],
      lonNmea.split(',')[0],
      lonNmea.split(',')[1],
      '1', // Fix quality (0=invalid, 1=GPS fix, 2=DGPS fix, etc.)
      '08', // Number of satellites
      '1.0', // HDOP
      alt.toFixed(1), // Altitude
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
}
