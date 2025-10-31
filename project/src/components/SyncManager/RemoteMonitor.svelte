<script lang="ts">
  import { onMount } from 'svelte';
  import { RemoteLinkManager } from '$lib/network/RemoteLinkManager';
  import { DeviceSecurityPolicy } from '$lib/security/DeviceSecurityPolicy';
  import { FusionAuditLog } from '$lib/security/FusionAuditLog';
  import { fade } from 'svelte/transition';
  import { toast } from '@skeletonlabs/skeleton';

  let devices: Array<{
    id: string;
    name: string;
    type: 'wifi' | 'gsm' | 'uhf';
    protocol: string;
    lastSeen: Date;
    status: 'online' | 'offline' | 'error';
  }> = [];
  
  let policies: Array<{
    id: string;
    role: string;
    token: string;
    expiresAt: Date;
  }> = [];
  
  let logs: Array<{
    id: string;
    deviceId: string;
    action: string;
    timestamp: Date;
    details: Record<string, unknown>;
  }> = [];
  
  let selectedDevice: string | null = null;
  let isLoading = true;
  
  // Load data
  async function loadData() {
    try {
      isLoading = true;
      devices = await RemoteLinkManager.listDevices();
      policies = await DeviceSecurityPolicy.list();
      
      // Load logs for the first device by default
      if (devices.length > 0 && !selectedDevice) {
        selectedDevice = devices[0].id;
      }
      
      if (selectedDevice) {
        logs = await FusionAuditLog.getDeviceLogs(selectedDevice);
      }
    } catch (error) {
      console.error('Error loading device data:', error);
      toast.error('Erreur lors du chargement des appareils');
    } finally {
      isLoading = false;
    }
  }
  
  async function revoke(deviceId: string) {
    try {
      await DeviceSecurityPolicy.revokeToken(deviceId);
      await loadData();
      toast.success('Jeton révoqué avec succès');
    } catch (error) {
      console.error('Error revoking token:', error);
      toast.error('Erreur lors de la révocation du jeton');
    }
  }

  async function regenerate(deviceId: string) {
    try {
      const device = devices.find(d => d.id === deviceId);
      if (!device) return;
      
      const token = await DeviceSecurityPolicy.generateToken(deviceId);
      await loadData();
      
      // Show token in a secure way
      if (confirm('Copier le nouveau jeton dans le presse-papier ?')) {
        await navigator.clipboard.writeText(token);
        toast.success('Jeton copié dans le presse-papier');
      }
    } catch (error) {
      console.error('Error regenerating token:', error);
      toast.error('Erreur lors de la régénération du jeton');
    }
  }
  
  function getDeviceTypeIcon(type: string) {
    switch (type.toLowerCase()) {
      case 'wifi': return '📶';
      case 'gsm': return '📱';
      case 'uhf': return '📡';
      default: return '🔌';
    }
  }
  
  function getStatusBadge(status: string) {
    const statusConfig = {
      online: { text: 'En ligne', class: 'bg-green-100 text-green-800' },
      offline: { text: 'Hors ligne', class: 'bg-gray-100 text-gray-800' },
      error: { text: 'Erreur', class: 'bg-red-100 text-red-800' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.offline;
    return `<span class="px-2 py-1 text-xs rounded-full ${config.class}">${config.text}</span>`;
  }
  
  onMount(() => {
    loadData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  });
  
  $: if (selectedDevice) {
    FusionAuditLog.getDeviceLogs(selectedDevice).then(logsData => {
      logs = logsData;
    });
  }
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
      📡 Supervision des appareils distants
    </h2>
    <button 
      on:click={loadData}
      class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      disabled={isLoading}
    >
      {isLoading ? 'Chargement...' : 'Actualiser'}
    </button>
  </div>
  
  {#if isLoading && devices.length === 0}
    <div class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Chargement des appareils...</p>
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Nom
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Type
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Protocole
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Statut
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Rôle
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Dernière activité
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {#each devices as device (device.id)}
              <tr 
                class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer {selectedDevice === device.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}"
                on:click={() => selectedDevice = device.id}
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full">
                      <span class="text-lg">{getDeviceTypeIcon(device.type)}</span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">{device.name}</div>
                      <div class="text-sm text-gray-500 dark:text-gray-400">ID: {device.id.substring(0, 8)}...</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 dark:text-white capitalize">{device.type}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {device.protocol.toUpperCase()}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  {@html getStatusBadge(device.status)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {policies.find(p => p.id === device.id)?.role || 'Non défini'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {new Date(device.lastSeen).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div class="flex justify-end space-x-2">
                    <button
                      on:click|stopPropagation={() => regenerate(device.id)}
                      class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      title="Régénérer le jeton"
                    >
                      🔄
                    </button>
                    <button
                      on:click|stopPropagation={() => revoke(device.id)}
                      class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      title="Révoquer l'accès"
                    >
                      🚫
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    
    {#if devices.length === 0}
      <div class="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="text-gray-400 dark:text-gray-500">
          <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Aucun appareil connecté</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Aucun appareil n'est actuellement connecté au système.
          </p>
        </div>
      </div>
    {/if}
    
    {#if selectedDevice}
      <div class="mt-8">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          📜 Journaux de sécurité
          <span class="text-sm text-gray-500 dark:text-gray-400">
            - {devices.find(d => d.id === selectedDevice)?.name}
          </span>
        </h3>
        
        <div class="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
          <div class="overflow-y-auto max-h-96">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date/Heure
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Action
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {#if logs.length > 0}
                  {#each logs as log (log.id)}
                    <tr in:fade>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          {log.action.includes('error') ? 'bg-red-100 text-red-800' : 
                           log.action.includes('warn') ? 'bg-yellow-100 text-yellow-800' : 
                           'bg-green-100 text-green-800'}">
                          {log.action}
                        </span>
                      </td>
                      <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <div class="max-w-md overflow-hidden truncate">
                          {JSON.stringify(log.details)}
                        </div>
                        <button 
                          class="text-xs text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          on:click={() => {
                            // Show full details in a modal or expand the row
                            console.log('Log details:', log);
                          }}
                        >
                          Voir plus
                        </button>
                      </td>
                    </tr>
                  {/each}
                {:else}
                  <tr>
                    <td colspan="3" class="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      Aucun journal trouvé pour cet appareil.
                    </td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* Custom scrollbar for logs */
  .overflow-y-auto::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
  
  /* Dark mode scrollbar */
  .dark .overflow-y-auto::-webkit-scrollbar-track {
    background: #374151;
  }
  
  .dark .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #4b5563;
  }
  
  .dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
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
</style>
