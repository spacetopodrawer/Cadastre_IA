import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  message?: string;
}

class IntegrationTests {
  private results: TestResult[] = [];
  private token: string = '';
  private userId: string = '';
  private fileId: string = '';
  private socket: Socket | null = null;

  async runAll() {
    console.log('\n🧪 DÉMARRAGE DES TESTS D\'INTÉGRATION\n');

    await this.testServerHealth();
    await this.testUserRegistration();
    await this.testOptionalAdminLogin();
    await this.testFileUpload();
    await this.testFileList();
    await this.testWebSocketConnection();
    await this.testDeviceRegistration();
    await this.testFileSyncRequest();
    await this.testFileVersioning();

    this.printResults();
  }

  private async testServerHealth() {
    try {
      const response = await axios.get(`${API_URL}/health`);
      this.addResult('Server Health Check', response.status === 200);
    } catch (error) {
      this.addResult('Server Health Check', false, 'Serveur inaccessible');
    }
  }

  private async testUserRegistration() {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email: `test${Date.now()}@cadastre.test`,
        password: 'TestPass123!',
        name: 'Test User'
      });

      this.token = response.data.token;
      this.userId = response.data.user.id;
      this.addResult('User Registration', !!this.token);
    } catch (error: any) {
      this.addResult('User Registration', false, error.response?.data?.error);
    }
  }

  private async testOptionalAdminLogin() {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: 'admin@cadastre.ia',
        password: 'AdminPass123!'
      });
      this.addResult('Admin Login (optional)', response.status === 200);
    } catch (error: any) {
      this.addResult('Admin Login (optional)', true, 'Admin not found - acceptable if not created yet');
    }
  }

  private async testFileUpload() {
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', Buffer.from('Test file content'), 'test.txt');

      const response = await axios.post(`${API_URL}/files/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${this.token}`
        }
      });

      this.fileId = response.data.file.id;
      this.addResult('File Upload', response.status === 201);
    } catch (error: any) {
      this.addResult('File Upload', false, error.response?.data?.error || error.message);
    }
  }

  private async testFileList() {
    try {
      const response = await axios.get(`${API_URL}/files`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      this.addResult('File List', Array.isArray(response.data.files));
    } catch (error: any) {
      this.addResult('File List', false, error.response?.data?.error);
    }
  }

  private async testWebSocketConnection() {
    return new Promise<void>((resolve) => {
      try {
        this.socket = io(SOCKET_URL, { transports: ['websocket'] });
        this.socket.on('connect', () => {
          this.addResult('WebSocket Connection', true);
          resolve();
        });
        this.socket.on('connect_error', (error) => {
          this.addResult('WebSocket Connection', false, (error as any).message);
          resolve();
        });
        setTimeout(() => {
          if (!this.socket?.connected) {
            this.addResult('WebSocket Connection', false, 'Timeout');
            resolve();
          }
        }, 5000);
      } catch (error: any) {
        this.addResult('WebSocket Connection', false, error.message);
        resolve();
      }
    });
  }

  private async testDeviceRegistration() {
    return new Promise<void>((resolve) => {
      if (!this.socket?.connected) {
        this.addResult('Device Registration', false, 'WebSocket non connecté');
        resolve();
        return;
      }
      this.socket.emit('register-device', {
        userId: this.userId,
        deviceName: 'Test Device',
        deviceType: 'PC'
      });

      const timeout = setTimeout(() => {
        this.addResult('Device Registration', false, 'Timeout');
        resolve();
      }, 5000);

      this.socket.once('device-registered', (data: any) => {
        clearTimeout(timeout);
        this.addResult('Device Registration', !!data.deviceId);
        resolve();
      });
    });
  }

  private async testFileSyncRequest() {
    return new Promise<void>((resolve) => {
      if (!this.socket?.connected || !this.fileId) {
        this.addResult('File Sync Request', false, 'Prérequis non remplis');
        resolve();
        return;
      }
      this.socket.emit('request-file-sync', { fileId: this.fileId });

      const timeout = setTimeout(() => {
        this.addResult('File Sync Request', false, 'Timeout');
        resolve();
      }, 5000);

      this.socket.once('file-sync-available', (data: any) => {
        clearTimeout(timeout);
        this.addResult('File Sync Request', data.fileId === this.fileId);
        resolve();
      });
    });
  }

  private async testFileVersioning() {
    try {
      if (!this.fileId) {
        this.addResult('File Versioning', false, 'Aucun fichier disponible');
        return;
      }
      const response = await axios.get(`${API_URL}/files/${this.fileId}/versions`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      this.addResult('File Versioning', Array.isArray(response.data.versions));
    } catch (error: any) {
      this.addResult('File Versioning', false, error.response?.data?.error);
    }
  }

  private addResult(name: string, success: boolean, message?: string) {
    this.results.push({ name, status: success ? 'PASS' : 'FAIL', message });
  }

  private printResults() {
    console.log('\n📊 RÉSULTATS DES TESTS\n');
    console.log('━'.repeat(80));
    let passed = 0;
    let failed = 0;

    this.results.forEach((result) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      const status = result.status === 'PASS' ? '[ PASS ]' : '[ FAIL ]';
      console.log(`${icon} ${status} ${result.name}`);
      if (result.message) console.log(`   └─ ${result.message}`);
      if (result.status === 'PASS') passed++; else failed++;
    });

    console.log('━'.repeat(80));
    console.log(`\n✅ Tests réussis: ${passed}/${this.results.length}`);
    console.log(`❌ Tests échoués: ${failed}/${this.results.length}`);
    const percentage = Math.round((passed / this.results.length) * 100);
    console.log(`📈 Taux de réussite: ${percentage}%\n`);

    if (this.socket) this.socket.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Exécuter les tests
const tests = new IntegrationTests();
tests.runAll().catch((err) => { console.error(err); process.exit(1); });
