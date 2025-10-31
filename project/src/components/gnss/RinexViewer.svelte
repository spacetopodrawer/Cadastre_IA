<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { rinexParser } from '$lib/gnss/RinexParser';
  import { fusionAuditLog } from '$lib/security/FusionAuditLog';
  import { fileSyncManager } from '$lib/sync/FileSyncManager';
  import { missionSync } from '$lib/sync/MissionSync';
  import { fade, fly } from 'svelte/transition';
  import * as FileSaver from 'file-saver';
  import { v4 as uuidv4 } from 'uuid';

  export let rinexContent: string = '';
  export let missionId: string = '';
  export let filePath: string = 'imported.24o';
  
  // State
  let header: any = {};
  let observations: any[] = [];
  let systems: Set<string> = new Set();
  let selectedSystem: string = 'all';
  let selectedSignal: string = 'all';
  let isLoading: boolean = false;
  let error: string | null = null;
  let activeTab: 'header' | 'observations' | 'stats' = 'observations';
  let stats: {
    totalObservations: number;
    startTime: Date | null;
    endTime: Date | null;
    signals: Record<string, number>;
  } = {
    totalObservations: 0,
    startTime: null,
    endTime: null,
    signals: {}
  };

  // Computed properties
  $: filteredObservations = observations.filter(obs => {
    const systemMatch = selectedSystem === 'all' || obs.satId?.startsWith(selectedSystem);
    const signalMatch = selectedSignal === 'all' || obs.signalType === selectedSignal;
    return systemMatch && signalMatch;
  }).slice(0, 1000); // Limit to 1000 for performance

  $: availableSignals = Array.from(new Set(observations.map(o => o.signalType))).filter(Boolean);
  
  // Lifecycle
  onMount(async () => {
    if (rinexContent) {
      await loadRinexData();
    }
  });

  async function loadRinexData() {
    try {
      isLoading = true;
      error = null;
      
      const result = await rinexParser.parseRinexFile(rinexContent, {
        missionId,
        filePath
      });
      
      header = result.header;
      observations = result.observations || [];
      
      // Extract unique GNSS systems (G=GPS, R=GLONASS, E=Galileo, etc.)
      systems = new Set(observations.map(f => f.satId?.slice(0, 1) || 'U').filter(Boolean));
      
      // Calculate statistics
      calculateStats();
      
      // Log the import
      await fusionAuditLog.logAction({
        action: 'RINEX_IMPORT',
        entityType: 'RINEX_FILE',
        entityId: filePath,
        details: {
          observationCount: observations.length,
          systems: Array.from(systems),
          fileSize: new Blob([rinexContent]).size
        },
        missionId
      });
      
    } catch (err) {
      console.error('Error loading RINEX data:', err);
      error = `Failed to parse RINEX file: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  function calculateStats() {
    if (!observations.length) return;
    
    const signals: Record<string, number> = {};
    let startTime: Date | null = null;
    let endTime: Date | null = null;
    
    observations.forEach(obs => {
      // Count signals
      if (obs.signalType) {
        signals[obs.signalType] = (signals[obs.signalType] || 0) + 1;
      }
      
      // Track time range
      if (obs.timestamp) {
        const date = new Date(obs.timestamp);
        if (!startTime || date < startTime) startTime = date;
        if (!endTime || date > endTime) endTime = date;
      }
    });
    
    stats = {
      totalObservations: observations.length,
      startTime,
      endTime,
      signals
    };
  }

  async function exportToFormat(format: 'GEOJSON' | 'GPX' | 'KML') {
    try {
      const data = await rinexParser.exportToFormat(observations, format);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const filename = `${filePath.replace(/\.[^/.]+$/, '')}.${format.toLowerCase()}`;
      
      FileSaver.saveAs(blob, filename);
      
      await fusionAuditLog.logAction({
        action: 'RINEX_EXPORT',
        entityType: 'RINEX_FILE',
        entityId: filePath,
        details: { format },
        missionId
      });
      
    } catch (err) {
      console.error(`Export to ${format} failed:`, err);
      error = `Export failed: ${err.message}`;
    }
  }
  
  function formatDate(date: Date | null): string {
    if (!date) return 'N/A';
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<div class="rinex-viewer" in:fly={{ y: 20, duration: 200 }}>
  {#if isLoading}
    <div class="loading">Chargement des données RINEX...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if !observations.length}
    <div class="empty">Aucune donnée d'observation disponible</div>
  {:else}
    <header class="viewer-header">
      <h2>📡 Visualisation RINEX</h2>
      <div class="file-info">
        <span class="filename">{filePath}</span>
        <span class="observation-count">{observations.length.toLocaleString()} observations</span>
      </div>
    </header>

    <div class="tabs">
      <button 
        class:active={activeTab === 'header'}
        on:click={() => activeTab = 'header'}
      >
        🧾 En-têtes
      </button>
      <button 
        class:active={activeTab === 'observations'}
        on:click={() => activeTab = 'observations'}
      >
        🛰️ Observations
      </button>
      <button 
        class:active={activeTab === 'stats'}
        on:click={() => activeTab = 'stats'}
      >
        📊 Statistiques
      </button>
    </div>

    {#if activeTab === 'header'}
      <div class="tab-content">
        <h3>Informations du fichier</h3>
        <div class="header-grid">
          <div class="header-item">
            <span class="label">Version RINEX:</span>
            <span class="value">{header.version || 'N/A'}</span>
          </div>
          <div class="header-item">
            <span class="label">Type de fichier:</span>
            <span class="value">{header.fileType || 'N/A'}</span>
          </div>
          <div class="header-item">
            <span class="label">Système GNSS:</span>
            <span class="value">{header.gnssType || 'N/A'}</span>
          </div>
          <div class="header-item">
            <span class="label">Marqueur:</span>
            <span class="value">{header.markerName || 'N/A'}</span>
          </div>
          <div class="header-item">
            <span class="label">Récepteur:</span>
            <span class="value">{header.receiverType || 'N/A'}</span>
          </div>
          <div class="header-item">
            <span class="label">Antenne:</span>
            <span class="value">{header.antennaType || 'N/A'}</span>
          </div>
          <div class="header-item full-width">
            <span class="label">Position approximative:</span>
            <span class="value">
              {header.positionApprox ? 
                `${header.positionApprox[0]?.toFixed(6)}°, ${header.positionApprox[1]?.toFixed(6)}°` : 
                'N/A'}
            </span>
          </div>
        </div>
      </div>
    
    {:else if activeTab === 'observations'}
      <div class="tab-content">
        <div class="filters">
          <div class="filter-group">
            <label for="system-filter">Système GNSS:</label>
            <select id="system-filter" bind:value={selectedSystem}>
              <option value="all">Tous</option>
              {#each Array.from(systems) as system}
                <option value={system}>
                  {system === 'G' ? 'GPS' : 
                   system === 'R' ? 'GLONASS' : 
                   system === 'E' ? 'Galileo' : 
                   system === 'C' ? 'BeiDou' : 
                   system === 'J' ? 'QZSS' : 
                   system === 'I' ? 'IRNSS' : 
                   system === 'S' ? 'SBAS' : system}
                </option>
              {/each}
            </select>
          </div>
          
          <div class="filter-group">
            <label for="signal-filter">Signal:</label>
            <select id="signal-filter" bind:value={selectedSignal}>
              <option value="all">Tous</option>
              {#each availableSignals as signal}
                <option value={signal}>{signal}</option>
              {/each}
            </select>
          </div>
          
          <div class="filter-info">
            Affichage de {filteredObservations.length} / {observations.length} observations
          </div>
        </div>
        
        <div class="observations-table-container">
          <table class="observations-table">
            <thead>
              <tr>
                <th>Date/Heure</th>
                <th>Satellite</th>
                <th>Signal</th>
                <th>Pseudodistance (m)</th>
                <th>Phase (cycles)</th>
                <th>SNR</th>
                <th>DOP</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredObservations as obs, i (obs.id || i)}
                <tr class:highlight={i % 2 === 0}>
                  <td>{obs.timestamp ? new Date(obs.timestamp).toLocaleTimeString() : 'N/A'}</td>
                  <td>{obs.satId || 'N/A'}</td>
                  <td>{obs.signalType || 'N/A'}</td>
                  <td>{obs.pseudorange?.toFixed(2) || '—'}</td>
                  <td>{obs.carrierPhase?.toFixed(2) || '—'}</td>
                  <td>{obs.snr || '—'}</td>
                  <td>{obs.dop?.toFixed(1) || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    
    {:else if activeTab === 'stats'}
      <div class="tab-content">
        <h3>Statistiques des observations</h3>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{stats.totalObservations.toLocaleString()}</div>
            <div class="stat-label">Observations totales</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value">{Array.from(systems).join(', ')}</div>
            <div class="stat-label">Systèmes GNSS</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value">{availableSignals.length}</div>
            <div class="stat-label">Types de signaux</div>
          </div>
          
          <div class="stat-card full-width">
            <div class="stat-value">
              {formatDate(stats.startTime)} - {formatDate(stats.endTime)}
            </div>
            <div class="stat-label">Période d'observation</div>
          </div>
        </div>
        
        <h4>Répartition par signal</h4>
        <div class="signals-chart">
          {#each Object.entries(stats.signals) as [signal, count]}
            <div class="signal-bar" 
                 style="width: {(count / stats.totalObservations * 100)}%"
                 title="{signal}: {count} observations">
              <span class="signal-label">{signal}</span>
              <span class="signal-count">{count}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <div class="export-actions">
      <button class="export-btn" on:click={() => exportToFormat('GEOJSON')}>
        📤 Exporter GeoJSON
      </button>
      <button class="export-btn" on:click={() => exportToFormat('GPX')}>
        📤 Exporter GPX
      </button>
      <button class="export-btn" on:click={() => exportToFormat('KML')}>
        📤 Exporter KML
      </button>
    </div>
  {/if}
</div>

<style>
  .rinex-viewer {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.5rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  .viewer-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eaeaea;
  }
  
  .file-info {
    display: flex;
    justify-content: space-between;
    color: #666;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }
  
  .filename {
    font-weight: 500;
    color: #333;
  }
  
  .observation-count {
    background: #f0f4ff;
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
    font-size: 0.8rem;
    color: #3a6bc8;
  }
  
  .tabs {
    display: flex;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 1.5rem;
  }
  
  .tabs button {
    padding: 0.7rem 1.2rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 0.95rem;
    color: #555;
    transition: all 0.2s;
  }
  
  .tabs button:hover {
    color: #1a73e8;
    background: #f8f9fa;
  }
  
  .tabs button.active {
    color: #1a73e8;
    border-bottom-color: #1a73e8;
    font-weight: 500;
  }
  
  .tab-content {
    min-height: 400px;
    margin-bottom: 1.5rem;
  }
  
  .header-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }
  
  .header-item {
    padding: 0.8rem;
    background: #f9f9f9;
    border-radius: 6px;
  }
  
  .header-item.full-width {
    grid-column: 1 / -1;
  }
  
  .label {
    display: block;
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.3rem;
  }
  
  .value {
    font-weight: 500;
    word-break: break-word;
  }
  
  .filters {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    align-items: center;
    padding: 0.8rem 0;
    border-bottom: 1px solid #eee;
  }
  
  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .filter-group label {
    font-size: 0.9rem;
    color: #555;
  }
  
  .filter-group select {
    padding: 0.4rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 0.9rem;
  }
  
  .filter-info {
    margin-left: auto;
    font-size: 0.85rem;
    color: #666;
  }
  
  .observations-table-container {
    max-height: 600px;
    overflow-y: auto;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
  }
  
  .observations-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  
  .observations-table th,
  .observations-table td {
    padding: 0.7rem 1rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }
  
  .observations-table th {
    position: sticky;
    top: 0;
    background: #f5f7fa;
    font-weight: 600;
    color: #444;
    white-space: nowrap;
  }
  
  .observations-table tbody tr:hover {
    background-color: #f8f9fa;
  }
  
  .highlight {
    background-color: #f8f9fa;
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat-card {
    background: #f8f9fa;
    padding: 1.2rem;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  
  .stat-card.full-width {
    grid-column: 1 / -1;
    text-align: left;
  }
  
  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1a73e8;
    margin-bottom: 0.3rem;
  }
  
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .signals-chart {
    margin-top: 1rem;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
  }
  
  .signal-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: #e3f2fd;
    color: #0d47a1;
    font-size: 0.85rem;
    margin-bottom: 1px;
    transition: width 0.3s ease;
    min-width: max-content;
  }
  
  .signal-bar:last-child {
    margin-bottom: 0;
  }
  
  .signal-label {
    font-weight: 500;
  }
  
  .signal-count {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.1rem 0.5rem;
    border-radius: 10px;
    font-size: 0.8rem;
  }
  
  .export-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1.5rem;
    border-top: 1px solid #eee;
    margin-top: 1.5rem;
  }
  
  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .export-btn:hover {
    background: #1557b0;
  }
  
  .loading, .error, .empty {
    padding: 2rem;
    text-align: center;
    color: #666;
    font-size: 1.1rem;
  }
  
  .error {
    color: #d32f2f;
    background: #ffebee;
    border-radius: 6px;
    padding: 1rem;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .header-grid {
      grid-template-columns: 1fr;
    }
    
    .filters {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.8rem;
    }
    
    .filter-info {
      margin-left: 0;
      width: 100%;
      text-align: center;
      padding-top: 0.5rem;
      border-top: 1px solid #eee;
    }
    
    .export-actions {
      flex-direction: column;
      gap: 0.8rem;
    }
    
    .export-btn {
      justify-content: center;
    }
  }
</style>
