<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncStore } from '$components/SyncManager';
  import { syncLayer, type LayerSyncStatus } from '$lib/sync/layerSync';
  import { Button } from '$components/ui/button';
  import { RefreshCw, AlertCircle, CheckCircle, WifiOff } from 'lucide-svelte';
  import { fade } from 'svelte/transition';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // Définir le type pour une couche
  interface Layer {
    id: string;
    name: string;
    type: string;
    source: any;
    metadata?: Record<string, unknown>;
  }

  export let layers: Layer[] = [];
  export let selectedLayerId: string | null = null;
  
  // État de synchronisation
  let syncStatus: Record<string, LayerSyncStatus> = {};
  let isSyncing = false;
  let lastSyncTime: Date | null = null;
  let syncError: string | null = null;

  // Suivre les changements de statut de synchronisation
  const unsubscribe = syncStore.subscribe(($syncStore) => {
    const newStatus: Record<string, LayerSyncStatus> = {};
    
    $syncStore.forEach(file => {
      if (file.type === 'layer') {
        newStatus[file.id] = {
          status: file.status as 'synced' | 'pending' | 'conflict' | 'offline',
          lastSynced: file.lastSynced,
          error: file.status === 'conflict' ? (file.audit[file.audit.length - 1]?.split(': ')[1] || null) : null
        };
      }
    });
    
    syncStatus = newStatus;
  });

  // S'inscrire aux mises à jour de synchronisation au montage
  onMount(() => {
    console.log('CadastreLayer monté avec les couches :', layers);
    
    // Initialiser la synchronisation pour chaque couche
    layers.forEach(layer => {
      if (!syncStore.get().some(f => f.id === layer.id)) {
        syncStore.addFile({
          id: layer.id,
          name: layer.name,
          type: 'layer',
          status: 'synced',
          metadata: {
            ...layer.metadata,
            source: layer.source
          }
        });
      }
    });

    return () => {
      // Se désabonner lors du démontage
      unsubscribe();
    };
  });

  // Synchroniser toutes les couches
  async function syncAllLayers() {
    if (isSyncing) return;
    
    isSyncing = true;
    syncError = null;
    
    try {
      for (const layer of layers) {
        await syncLayer(layer);
      }
      lastSyncTime = new Date();
    } catch (error) {
      console.error('Erreur lors de la synchronisation des couches:', error);
      syncError = error instanceof Error ? error.message : 'Erreur inconnue';
    } finally {
      isSyncing = false;
    }
  }

  // Obtenir le statut de synchronisation d'une couche
  function getLayerStatus(layerId: string): LayerSyncStatus {
    return syncStatus[layerId] || { status: 'synced' };
  }

  // Obtenir l'icône de statut
  function getStatusIcon(status: string) {
    const iconClass = 'w-4 h-4 mr-1';
    
    switch (status) {
      case 'synced':
        return { icon: CheckCircle, class: `${iconClass} text-green-500` };
      case 'pending':
        return { icon: RefreshCw, class: `${iconClass} text-yellow-500 animate-spin` };
      case 'conflict':
        return { icon: AlertCircle, class: `${iconClass} text-red-500` };
      case 'offline':
        return { icon: WifiOff, class: `${iconClass} text-gray-400` };
      default:
        return { icon: null, class: '' };
    }
  }

  // Gérer la sélection d'une couche
  function handleLayerSelect(layerId: string) {
    selectedLayerId = layerId;
    // Émettre un événement si nécessaire
    // dispatch('layerSelect', { layerId });
  }

  // Gérer la synchronisation d'une seule couche
  async function handleSyncLayer(layer: Layer) {
    try {
      await syncLayer(layer);
    } catch (error) {
      console.error(`Erreur lors de la synchronisation de la couche ${layer.id}:`, error);
      syncError = error instanceof Error ? error.message : 'Erreur inconnue';
    }
  }
</script>

<div class="cadastre-layer">
  <div class="toolbar">
    <h3>Couches cartographiques</h3>
    <Button 
      size="sm" 
      variant="outline" 
      on:click={syncAllLayers}
      disabled={isSyncing}
      title="Synchroniser toutes les couches"
    >
      <RefreshCw class={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Synchronisation...' : 'Synchroniser'}
    </Button>
  </div>

  {#if syncError}
    <div class="error-message" transition:fade>
      <AlertCircle class="w-4 h-4 mr-2" />
      {syncError}
    </div>
  {/if}

  {#if lastSyncTime}
    <div class="last-sync" transition:fade>
      Dernière synchronisation: {lastSyncTime.toLocaleTimeString()}
    </div>
  {/if}

  {#if layers.length === 0}
    <div class="no-layers">Aucune couche chargée</div>
  {:else}
    <div class="layers-container">
      {#each layers as layer (layer.id)}
        {#const status = getLayerStatus(layer.id)}
        {#const { icon: StatusIcon, class: iconClass } = getStatusIcon(status.status)}
        
        <div 
          class="layer {selectedLayerId === layer.id ? 'selected' : ''} {status.status}"
          on:click={() => handleLayerSelect(layer.id)}
          transition:slide={{ duration: 200, easing: cubicOut }}
        >
          <div class="layer-info">
            <div class="layer-name">
              {#if StatusIcon}
                <svelte:component this={StatusIcon} class={iconClass} />
              {/if}
              {layer.name}
            </div>
            {#if status.lastSynced}
              <div class="layer-meta">
                {new Date(status.lastSynced).toLocaleTimeString()}
              </div>
            {/if}
          </div>
          
          {#if status.error}
            <div class="layer-error" transition:fade>
              <AlertCircle class="w-3 h-3 mr-1 text-red-500" />
              <span class="text-xs">{status.error}</span>
            </div>
          {/if}
          
          <div class="layer-actions">
            <Button 
              variant="ghost" 
              size="icon" 
              class="h-6 w-6"
              on:click|stopPropagation={() => syncLayer(layer)}
              title="Synchroniser cette couche"
            >
              <RefreshCwe class="w-3 h-3" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
    
    <div class="map-container">
      <!-- Intégration de la carte ici -->
      <div class="map-placeholder">
        Carte interactive (intégration avec la bibliothèque de cartographie)
      </div>
    </div>
  {/if}
</div>

<style>
  .cadastre-layer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }

  .toolbar h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .error-message {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    background-color: var(--destructive/10);
    color: var(--destructive);
    font-size: 0.8125rem;
    border-bottom: 1px solid var(--destructive/20);
  }

  .last-sync {
    padding: 0.25rem 1rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    text-align: right;
    background: var(--muted/30);
    border-bottom: 1px solid var(--border);
  }

  .layers-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .layer {
    position: relative;
    padding: 0.625rem 0.75rem;
    margin-bottom: 0.25rem;
    border-radius: var(--radius);
    background: var(--card);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .layer:hover {
    background: var(--accent);
    border-color: var(--border);
  }

  .layer.selected {
    border-color: var(--primary);
    background: var(--primary/5);
  }

  .layer.conflict {
    border-left: 3px solid var(--destructive);
  }

  .layer.pending {
    opacity: 0.8;
  }

  .layer-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .layer-name {
    display: flex;
    align-items: center;
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--foreground);
  }

  .layer-meta {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .layer-error {
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    color: var(--destructive);
    margin-top: 0.25rem;
  }

  .layer-actions {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .layer:hover .layer-actions {
    opacity: 1;
  }

  .no-layers {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: 0.875rem;
    padding: 2rem;
    text-align: center;
  }

  .map-container {
    height: 300px;
    background: var(--muted);
    border-top: 1px solid var(--border);
    position: relative;
  }

  .map-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
</style>

<style>
  .cadastre-layer {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .layers-container {
    padding: 1rem;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
  }
  
  .layer {
    padding: 0.5rem;
    margin: 0.25rem 0;
    cursor: pointer;
    border-radius: 4px;
  }
  
  .layer:hover {
    background: #e9e9e9;
  }
  
  .layer.selected {
    background: #e0f0ff;
    font-weight: bold;
  }
  
  .map-container {
    flex: 1;
    position: relative;
  }
  
  .map-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    background: #f9f9f9;
    border: 2px dashed #ddd;
    margin: 1rem;
  }
</style>
