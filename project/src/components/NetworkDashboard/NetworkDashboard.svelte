<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { remoteLinkManager } from '$lib/network/RemoteLinkManager';
  import { deviceSecurityPolicy } from '$lib/security/DeviceSecurityPolicy';
  import { fusionAuditLog } from '$lib/security/FusionAuditLog';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { toast } from '@skeletonlabs/skeleton';
  
  // Types
  type Device = {
    id: string;
    name: string;
    type: 'wifi' | 'gsm' | 'uhf' | 'ethernet' | 'bluetooth';
    protocol: 'HTTP' | 'MQTT' | 'WebSocket' | 'LoRa' | 'NFC';
    status: 'online' | 'offline' | 'error' | 'degraded';
    lastSeen: Date;
    signalStrength?: number;
    ipAddress?: string;
    macAddress?: string;
    firmwareVersion?: string;
  };

  type SecurityEvent = {
    id: string;
    timestamp: Date;
    type: 'security' | 'connection' | 'data' | 'system';
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    deviceId: string;
    details?: Record<string, any>;
  };

  // State
  let devices: Device[] = [];
  let securityEvents: SecurityEvent[] = [];
  let networkStats = {
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    errorDevices: 0,
    dataTransferred: 0, // in MB
    avgLatency: 0, // in ms
  };

  let selectedDevice: Device | null = null;
  let isLoading = true;
  let autoRefresh = true;
  let refreshInterval: NodeJS.Timeout;

  // Fetch data
  async function fetchData() {
    try {
      isLoading = true;
      
      // Fetch devices and policies in parallel
      const [devicesData, events] = await Promise.all([
        remoteLinkManager.listDevices(),
        fusionAuditLog.getLogs({
          limit: 50,
          types: ['security', 'connection']
        })
      ]);

      devices = devicesData;
      securityEvents = events.map(event => ({
        id: event.id,
        timestamp: new Date(event.timestamp),
        type: event.type,
        severity: event.severity || 'info',
        message: event.message || event.action,
        deviceId: event.deviceId,
        details: event.details
      }));

      // Update network stats
      updateNetworkStats();
      
      // Select first device if none selected
      if (!selectedDevice && devices.length > 0) {
        selectedDevice = devices[0];
      }
      
    } catch (error) {
      console.error('Error fetching network data:', error);
      toast.error('Erreur lors du chargement des données réseau');
    } finally {
      isLoading = false;
    }
  }

  function updateNetworkStats() {
    networkStats = {
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.status === 'online').length,
      offlineDevices: devices.filter(d => d.status === 'offline').length,
      errorDevices: devices.filter(d => d.status === 'error').length,
      dataTransferred: calculateDataTransferred(),
      avgLatency: calculateAverageLatency()
    };
  }

  function calculateDataTransferred(): number {
    // Simulate data transfer calculation
    return Math.round(Math.random() * 1000) / 10; // 0-100 MB
  }

  function calculateAverageLatency(): number {
    // Simulate latency calculation
    return Math.round(Math.random() * 50) + 10; // 10-60ms
  }

  function getDeviceEvents(deviceId: string) {
    return securityEvents
      .filter(event => event.deviceId === deviceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }

  function getSecurityStatus(device: Device): 'secure' | 'warning' | 'critical' {
    const events = securityEvents.filter(e => e.deviceId === device.id);
    
    if (events.some(e => e.severity === 'critical')) return 'critical';
    if (events.some(e => e.severity === 'warning')) return 'warning';
    
    return 'secure';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      case 'degraded': return 'bg-yellow-500';
      default: return 'bg-gray-300';
    }
  }

  function getSecurityIcon(status: string): string {
    switch (status) {
      case 'secure': return '🔒';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
      default: return 'ℹ️';
    }
  }

  // Lifecycle
  onMount(async () => {
    await fetchData();
    
    // Set up auto-refresh
    refreshInterval = setInterval(() => {
      if (autoRefresh) fetchData();
    }, 10000); // Refresh every 10 seconds
    
    return () => {
      clearInterval(refreshInterval);
    };
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
  });

  // Handle device selection
  function selectDevice(device: Device) {
    selectedDevice = device;
  }

  // Toggle auto-refresh
  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    toast.info(`Rafraîchissement automatique ${autoRefresh ? 'activé' : 'désactivé'}`);
  }

  // Format bytes to human-readable format
  function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
</script>

<div class="network-dashboard p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">📡 Tableau de bord réseau</h1>
          <p class="text-gray-600 dark:text-gray-400">Supervision en temps réel des appareils connectés</p>
        </div>
        <div class="flex items-center space-x-4">
          <button 
            on:click={fetchData}
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
            disabled={isLoading}
          >
            {#if isLoading}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Chargement...
            {:else}
              🔄 Actualiser
            {/if}
          </button>
          
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" bind:checked={autoRefresh} class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">Auto-rafraîchissement</span>
          </label>
        </div>
      </div>
    </header>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Total Devices -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Appareils connectés</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-white">{networkStats.onlineDevices} <span class="text-sm text-gray-500">/ {networkStats.totalDevices}</span></p>
          </div>
        </div>
      </div>

      <!-- Data Transferred -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Données échangées</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-white">{formatBytes(networkStats.dataTransferred * 1024 * 1024)}</p>
          </div>
        </div>
      </div>

      <!-- Latency -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Latence moyenne</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-white">{networkStats.avgLatency} <span class="text-sm">ms</span></p>
          </div>
        </div>
      </div>

      <!-- Security Status -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Sécurité</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-white">
              {networkStats.errorDevices > 0 ? '⚠️ Critique' : '✅ Sécurisé'}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Device List -->
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">Appareils connectés</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {networkStats.onlineDevices} en ligne, {networkStats.offlineDevices} hors ligne
            </p>
          </div>
          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each devices as device (device.id)}
              <button
                on:click={() => selectDevice(device)}
                class="w-full text-left px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center {selectedDevice?.id === device.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
              >
                <div class="flex-shrink-0">
                  <div class="relative">
                    <div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      {#if device.type === 'wifi'}
                        <span class="text-xl">📶</span>
                      {:else if device.type === 'gsm'}
                        <span class="text-xl">📱</span>
                      {:else if device.type === 'uhf'}
                        <span class="text-xl">📡</span>
                      {:else if device.type === 'ethernet'}
                        <span class="text-xl">🔌</span>
                      {:else}
                        <span class="text-xl">💻</span>
                      {/if}
                    </div>
                    <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full {getStatusColor(device.status)}"></span>
                  </div>
                </div>
                <div class="ml-4 flex-1 min-w-0">
                  <div class="flex justify-between">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{device.name}</p>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {getSecurityIcon(getSecurityStatus(device))}
                    </div>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {device.type.toUpperCase()} • {device.protocol}
                    {device.ipAddress ? ` • ${device.ipAddress}` : ''}
                  </p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Device Details & Events -->
      <div class="lg:col-span-2 space-y-6">
        {#if selectedDevice}
          <!-- Device Details -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                  {selectedDevice.name}
                  <span class="ml-2 text-sm px-2 py-1 rounded-full {getStatusColor(selectedDevice.status)} text-white text-xs">
                    {selectedDevice.status === 'online' ? 'En ligne' : selectedDevice.status === 'offline' ? 'Hors ligne' : 'Erreur'}
                  </span>
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {selectedDevice.type.toUpperCase()} • {selectedDevice.protocol}
                </p>
              </div>
              <div class="flex space-x-2">
                <button 
                  class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title="Rafraîchir les données"
                  on:click={fetchData}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button 
                  class="p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  title="Voir les détails"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="px-6 py-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Informations générales</h3>
                  <dl class="mt-2 space-y-2">
                    <div class="flex justify-between">
                      <dt class="text-sm text-gray-500 dark:text-gray-400">ID</dt>
                      <dd class="text-sm text-gray-900 dark:text-gray-100 font-mono">{selectedDevice.id}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-sm text-gray-500 dark:text-gray-400">Type</dt>
                      <dd class="text-sm text-gray-900 dark:text-gray-100">{selectedDevice.type.toUpperCase()}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-sm text-gray-500 dark:text-gray-400">Protocole</dt>
                      <dd class="text-sm text-gray-900 dark:text-gray-100">{selectedDevice.protocol}</dd>
                    </div>
                    {#if selectedDevice.ipAddress}
                      <div class="flex justify-between">
                        <dt class="text-sm text-gray-500 dark:text-gray-400">Adresse IP</dt>
                        <dd class="text-sm text-gray-900 dark:text-gray-100 font-mono">{selectedDevice.ipAddress}</dd>
                      </div>
                    {/if}
                    {#if selectedDevice.macAddress}
                      <div class="flex justify-between">
                        <dt class="text-sm text-gray-500 dark:text-gray-400">Adresse MAC</dt>
                        <dd class="text-sm text-gray-900 dark:text-gray-100 font-mono">{selectedDevice.macAddress}</dd>
                      </div>
                    {/if}
                    <div class="flex justify-between">
                      <dt class="text-sm text-gray-500 dark:text-gray-400">Dernière activité</dt>
                      <dd class="text-sm text-gray-900 dark:text-gray-100">
                        {new Date(selectedDevice.lastSeen).toLocaleTimeString()}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Statut réseau</h3>
                  <div class="mt-2 space-y-3">
                    <div>
                      <div class="flex justify-between text-sm mb-1">
                        <span class="text-gray-500 dark:text-gray-400">Signal</span>
                        <span class="text-gray-900 dark:text-gray-100">
                          {selectedDevice.signalStrength ? `${selectedDevice.signalStrength}%` : 'N/A'}
                        </span>
                      </div>
                      <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          class="h-2 rounded-full {getStatusColor(selectedDevice.status)}" 
                          style={`width: ${selectedDevice.signalStrength || 0}%`}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div class="flex justify-between text-sm mb-1">
                        <span class="text-gray-500 dark:text-gray-400">Latence</span>
                        <span class="text-gray-900 dark:text-gray-100">{networkStats.avgLatency} ms</span>
                      </div>
                      <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          class="h-2 rounded-full bg-blue-600" 
                          style={`width: ${Math.max(0, 100 - networkStats.avgLatency)}%`}
                        ></div>
                      </div>
                    </div>
                    <div class="pt-2">
                      <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Sécurité</h4>
                      <div class="flex items-center space-x-2">
                        <span class="text-xl">{getSecurityIcon(getSecurityStatus(selectedDevice))}</span>
                        <span class="text-sm">
                          {getSecurityStatus(selectedDevice) === 'secure' 
                            ? 'Sécurisé' 
                            : getSecurityStatus(selectedDevice) === 'warning' 
                              ? 'Avertissement' 
                              : 'Critique'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent Events -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">Activité récente</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Derniers événements pour {selectedDevice.name}
              </p>
            </div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#if getDeviceEvents(selectedDevice.id).length > 0}
                {#each getDeviceEvents(selectedDevice.id) as event (event.id)}
                  <div 
                    class="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    in:fly={{ y: 20, duration: 300, easing: quintOut }}
                  >
                    <div class="flex items-start">
                      <div class="flex-shrink-0 mt-0.5">
                        {#if event.severity === 'error' || event.severity === 'critical'}
                          <div class="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                        {:else if event.severity === 'warning'}
                          <div class="h-8 w-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                        {:else}
                          <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        {/if}
                      </div>
                      <div class="ml-3 flex-1">
                        <div class="flex items-center justify-between">
                          <p class="text-sm font-medium text-gray-900 dark:text-white">
                            {event.message}
                          </p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        {#if event.details}
                          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            <pre class="whitespace-pre-wrap">{JSON.stringify(event.details, null, 2)}</pre>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              {:else}
                <div class="px-6 py-8 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Aucun événement récent</h3>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Aucune activité n'a été enregistrée pour cet appareil.
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden p-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Aucun appareil sélectionné</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Sélectionnez un appareil dans la liste pour afficher ses détails.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .network-dashboard {
    --background: #f9fafb;
    --foreground: #111827;
  }
  
  .dark .network-dashboard {
    --background: #111827;
    --foreground: #f9fafb;
  }
  
  pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.75rem;
    line-height: 1.25;
  }
  
  /* Smooth transitions */
  .transition-colors {
    transition-property: background-color, border-color, color, fill, stroke;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
  }
  
  /* Custom animations */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  
  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
  
  .dark ::-webkit-scrollbar-track {
    background: #374151;
  }
  
  .dark ::-webkit-scrollbar-thumb {
    background: #4b5563;
  }
  
  .dark ::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
</style>
