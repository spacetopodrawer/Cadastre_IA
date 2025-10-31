import { EventEmitter } from 'events';

export class IMUReader extends EventEmitter {
  private sensor: any = null;
  private isActive = false;
  private lastData: IMUData | null = null;
  private calibrationData = {
    acceleration: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 0, y: 0, z: 0 },
  };
  private isCalibrating = false;
  private calibrationSamples: IMUData[] = [];
  private readonly CALIBRATION_SAMPLES = 100;

  constructor() {
    super();
  }

  /**
   * Start reading IMU data
   */
  public async start(): Promise<void> {
    if (this.isActive) return;

    try {
      // Check for Generic Sensor API support
      if ('Accelerometer' in window && 'Gyroscope' in window) {
        await this.startGenericSensors();
      } 
      // Check for DeviceOrientation and DeviceMotion API as fallback
      else if ('DeviceOrientationEvent' in window && 'DeviceMotionEvent' in window) {
        this.startLegacySensors();
      } else {
        throw new Error('IMU sensors not supported in this browser');
      }
      
      this.isActive = true;
      console.log('IMU sensor started');
    } catch (error) {
      console.error('Failed to start IMU sensors:', error);
      throw error;
    }
  }

  /**
   * Stop reading IMU data
   */
  public stop(): void {
    if (this.sensor) {
      if (this.sensor.stop) {
        this.sensor.stop();
      }
      this.sensor = null;
    }
    
    // Remove event listeners
    window.removeEventListener('deviceorientation', this.handleOrientation);
    window.removeEventListener('devicemotion', this.handleMotion);
    
    this.isActive = false;
  }

  /**
   * Start using Generic Sensor API (modern browsers)
   */
  private async startGenericSensors(): Promise<void> {
    try {
      // Request permission for motion sensors (required on some devices)
      if ('requestPermission' in DeviceOrientationEvent) {
        // @ts-ignore - requestPermission is not in the TypeScript definitions yet
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Permission to access motion sensors was denied');
        }
      }

      // Create and start the accelerometer
      // @ts-ignore - Generic Sensor API types are not fully supported yet
      const accelerometer = new Accelerometer({ frequency: 60 });
      
      // @ts-ignore
      const gyroscope = new Gyroscope({ frequency: 60 });
      
      let magnetometer = null;
      // @ts-ignore
      if ('Magnetometer' in window) {
        // @ts-ignore
        magnetometer = new Magnetometer({ frequency: 10 });
      }

      accelerometer.addEventListener('reading', () => {
        const data: IMUData = {
          acceleration: [
            accelerometer.x - this.calibrationData.acceleration.x,
            accelerometer.y - this.calibrationData.acceleration.y,
            accelerometer.z - this.calibrationData.acceleration.z
          ] as [number, number, number],
          gyroscope: [
            gyroscope.x - this.calibrationData.gyroscope.x,
            gyroscope.y - this.calibrationData.gyroscope.y,
            gyroscope.z - this.calibrationData.gyroscope.z
          ] as [number, number, number],
          timestamp: Date.now(),
        };

        if (magnetometer) {
          data.magnetometer = [
            magnetometer.x - this.calibrationData.magnetometer.x,
            magnetometer.y - this.calibrationData.magnetometer.y,
            magnetometer.z - this.calibrationData.magnetometer.z
          ] as [number, number, number];
        }

        this.lastData = data;
        this.emit('update', data);
      });

      // Start all sensors
      accelerometer.start();
      gyroscope.start();
      magnetometer?.start();
      
      this.sensor = { accelerometer, gyroscope, magnetometer };
      
    } catch (error) {
      console.error('Error initializing Generic Sensor API:', error);
      throw error;
    }
  }

  /**
   * Fallback for browsers without Generic Sensor API
   */
  private startLegacySensors(): void {
    // Add event listeners for device orientation and motion
    window.addEventListener('deviceorientation', this.handleOrientation);
    window.addEventListener('devicemotion', this.handleMotion);
  }

  /**
   * Handle device orientation events (for gyroscope data)
   */
  private handleOrientation = (event: DeviceOrientationEvent) => {
    if (!this.isActive) return;
    
    // Convert degrees to radians
    const toRad = (deg: number | null) => deg !== null ? deg * (Math.PI / 180) : 0;
    
    const data: IMUData = {
      orientation: {
        alpha: toRad(event.alpha), // z-axis rotation
        beta: toRad(event.beta ?? 0),   // x-axis rotation
        gamma: toRad(event.gamma ?? 0),  // y-axis rotation
      },
      acceleration: this.lastData?.acceleration || [0, 0, 0],
      gyroscope: [
        toRad(event.beta ?? 0) * 0.1,  // Approximate angular velocity
        toRad(event.gamma ?? 0) * 0.1,
        toRad(event.alpha ?? 0) * 0.1,
      ] as [number, number, number],
      timestamp: Date.now(),
    };
    
    this.lastData = data;
    this.emit('update', data);
  };

  /**
   * Handle device motion events (for accelerometer data)
   */
  private handleMotion = (event: DeviceMotionEvent) => {
    if (!this.isActive) return;
    
    const acceleration = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
    const rotationRate = event.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    const data: IMUData = {
      acceleration: [
        (acceleration.x ?? 0) - this.calibrationData.acceleration.x,
        (acceleration.y ?? 0) - this.calibrationData.acceleration.y,
        (acceleration.z ?? 0) - this.calibrationData.acceleration.z
      ] as [number, number, number],
      gyroscope: [
        (rotationRate.beta ?? 0) * (Math.PI / 180) - this.calibrationData.gyroscope.x,
        (rotationRate.gamma ?? 0) * (Math.PI / 180) - this.calibrationData.gyroscope.y,
        (rotationRate.alpha ?? 0) * (Math.PI / 180) - this.calibrationData.gyroscope.z
      ] as [number, number, number],
      timestamp: Date.now(),
    };
    
    // If we have orientation data, include it
    if (this.lastData?.orientation) {
      data.orientation = { ...this.lastData.orientation };
    }
    
    this.lastData = data;
    this.emit('update', data);
  };

  /**
   * Start calibration process
   */
  public startCalibration(): void {
    if (this.isCalibrating) return;
    
    this.isCalibrating = true;
    this.calibrationSamples = [];
    
    // Collect samples for calibration
    const calibrationInterval = setInterval(() => {
      if (this.lastData) {
        this.calibrationSamples.push(this.lastData);
        
        if (this.calibrationSamples.length >= this.CALIBRATION_SAMPLES) {
          this.finishCalibration();
          clearInterval(calibrationInterval);
        }
      }
    }, 100);
    
    // Timeout in case we don't get enough samples
    setTimeout(() => {
      if (this.isCalibrating) {
        clearInterval(calibrationInterval);
        this.finishCalibration();
      }
    }, 10000);
  }

  /**
   * Calculate calibration values from collected samples
   */
  private finishCalibration(): void {
    if (this.calibrationSamples.length === 0) {
      this.isCalibrating = false;
      return;
    }
    
    // Calculate average values for calibration
    const sum = this.calibrationSamples.reduce((acc, sample) => {
      return {
        accelX: acc.accelX + sample.acceleration[0],
        accelY: acc.accelY + sample.acceleration[1],
        accelZ: acc.accelZ + sample.acceleration[2],
        gyroX: acc.gyroX + sample.gyroscope[0],
        gyroY: acc.gyroY + sample.gyroscope[1],
        gyroZ: acc.gyroZ + sample.gyroscope[2],
        count: acc.count + 1
      };
    }, { accelX: 0, accelY: 0, accelZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0, count: 0 });
    
    const count = sum.count || 1;
    
    // Update calibration data
    this.calibrationData = {
      acceleration: {
        x: sum.accelX / count,
        y: sum.accelY / count,
        z: sum.accelZ / count - 9.81 // Subtract gravity
      },
      gyroscope: {
        x: sum.gyroX / count,
        y: sum.gyroY / count,
        z: sum.gyroZ / count
      },
      magnetometer: { x: 0, y: 0, z: 0 } // Magnetometer calibration would be more complex
    };
    
    this.isCalibrating = false;
    this.emit('calibrationComplete', this.calibrationData);
    console.log('IMU calibration complete:', this.calibrationData);
  }

  /**
   * Get the current IMU data
   */
  public getCurrentData(): IMUData | null {
    return this.lastData;
  }

  /**
   * Set calibration data manually
   */
  public setCalibrationData(calibration: typeof this.calibrationData): void {
    this.calibrationData = { ...calibration };
  }

  /**
   * Get the current calibration data
   */
  public getCalibrationData(): typeof this.calibrationData {
    return { ...this.calibrationData };
  }
}

// Export a singleton instance
export const imuReader = new IMUReader();
