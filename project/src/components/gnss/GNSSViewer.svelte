<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { fly } from 'svelte/transition';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { llmAssistant } from '$lib/ai/LLMAssistant';
  import { fusionAuditLog } from '$lib/security/FusionAuditLog';
  import { fileSyncManager } from '$lib/sync/FileSyncManager';
  import { missionSync } from '$lib/sync/MissionSync';
  import { offlineMapRenderer } from '$lib/map/OfflineMapRenderer';
  
  export let report: any;
  
  // Références aux éléments du DOM
  let mapContainer: HTMLDivElement;
  let map: L.Map;
  let layerControl: L.Control.Layers;
  
  // État du composant
  let isMapReady = false;
  let isOffline = false;
  let selectedFix: any = null;
  let showMetadata = false;
  let activeLayers: Record<string, L.Layer> = {};
  
  // Options de la carte
  const mapOptions = {
    zoom: 15,
    minZoom: 2,
    maxZoom: 22,
    zoomControl: true,
    preferCanvas: true
  };

  // Couleurs pour les différents types de fix
  const fixColors: Record<string, string> = {
    'RTK': '#10b981',    // green-500
    'PPK': '#10b981',    // green-500
    'Float': '#f59e0b',  // amber-500
    'DGPS': '#f59e0b',   // amber-500
    'Single': '#6b7280', // gray-500
    'Unknown': '#9ca3af' // gray-400
  };

  // Initialisation de la carte
  onMount(async () => {
    if (!report?.fixes?.length) return;
    
    try {
      // Vérifier le mode hors ligne
      isOffline = !navigator.onLine;
      
      // Créer la carte
      map = L.map(mapContainer, mapOptions);
      
      // Ajouter les tuiles de base
      await addBaseLayers();
      
      // Centrer sur les données
      const bounds = getFixesBounds(report.fixes);
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.1));
      } else {
        map.setView([report.fixes[0].lat, report.fixes[0].lon], mapOptions.zoom);
      }
      
      // Ajouter les traces GNSS
      addGNSSLayers();
      
      // Initialiser le contrôle des couches
      initLayerControl();
      
      // Écouter les changements de mode hors ligne
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      
      isMapReady = true;
      
      // Journaliser la visualisation
      await fusionAuditLog.log({
        action: 'gnss_view',
        entityType: 'mission',
        entityId: report.missionId,
        details: {
          fixCount: report.fixes.length,
          duration: report.summary?.duration,
          dominantMode: report.summary?.dominantMode
        }
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de la carte:', error);
    }
  });

  // Nettoyage
  onDestroy(() => {
    if (map) {
      map.remove();
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    }
  });

  // Mettre à jour le statut de connexion
  function updateOnlineStatus() {
    isOffline = !navigator.onLine;
    if (map) {
      // Mettre à jour les couches en fonction du statut
      map.eachLayer(layer => {
        if (layer instanceof L.TileLayer && 'options' in layer) {
          const tileLayer = layer as L.TileLayer;
          if (isOffline) {
            tileLayer.setUrl(offlineMapRenderer.getOfflineTileUrl(tileLayer.getTileSize()));
          } else {
            // Restaurer l'URL d'origine si disponible
            const originalUrl = (tileLayer as any)._originalUrl;
            if (originalUrl) {
              tileLayer.setUrl(originalUrl);
            }
          }
        }
      });
    }
  }

  // Ajouter les couches de base (OSM, satellite, etc.)
  async function addBaseLayers() {
    const baseLayers: Record<string, L.TileLayer> = {
      'OpenStreetMap': L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }
      ),
      'Satellite': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '© Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, NGA, and the GIS User Community',
          maxZoom: 19
        }
      ),
      'Topographique': L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {
          attribution: '© OpenTopoMap (CC-BY-SA)',
          maxZoom: 17
        }
      )
    };

    // Ajouter les couches à la carte
    Object.values(baseLayers).forEach(layer => {
      layer.addTo(map);
    });

    // Enregistrer les couches pour le contrôle
    if (layerControl) {
      Object.entries(baseLayers).forEach(([name, layer]) => {
        layerControl.addBaseLayer(layer, name);
      });
    } else {
      // Activer OpenStreetMap par défaut
      baseLayers['OpenStreetMap'].addTo(map);
    }
  }

  // Ajouter les couches GNSS (traces, points, etc.)
  function addGNSSLayers() {
    if (!map) return;
    
    // Grouper les fixes par qualité
    const fixesByQuality: Record<string, PositionFix[]> = {};
    report.fixes.forEach((fix: PositionFix) => {
      const quality = fix.quality || 'Unknown';
      if (!fixesByQuality[quality]) {
        fixesByQuality[quality] = [];
      }
      fixesByQuality[quality].push(fix);
    });

    // Créer une couche par qualité de fix
    Object.entries(fixesByQuality).forEach(([quality, fixes]) => {
      const color = fixColors[quality] || fixColors['Unknown'];
      
      // Créer un groupe pour cette qualité
      const group = L.layerGroup();
      
      // Trier par timestamp
      fixes.sort((a, b) => a.timestamp - b.timestamp);
      
      // Ajouter les points
      fixes.forEach((fix, index) => {
        const isFirst = index === 0;
        const isLast = index === fixes.length - 1;
        
        // Créer un marqueur pour chaque point
        const marker = L.circleMarker(
          [fix.lat, fix.lon],
          {
            radius: isFirst || isLast ? 8 : 6,
            color: '#000',
            weight: 1,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.8,
            className: 'gnss-fix-marker'
          }
        );
        
        // Ajouter un popup avec les métadonnées
        const popupContent = createPopupContent(fix, index, fixes.length);
        marker.bindPopup(popupContent);
        
        // Gérer la sélection
        marker.on('click', () => {
          selectedFix = fix;
          showMetadata = true;
        });
        
        marker.addTo(group);
      });
      
      // Ajouter une ligne reliant les points
      if (fixes.length > 1) {
        const line = L.polyline(
          fixes.map(fix => [fix.lat, fix.lon]),
          {
            color,
            weight: 3,
            opacity: 0.7,
            dashArray: quality === 'RTK' ? undefined : '5, 5'
          }
        );
        line.addTo(group);
      }
      
      // Ajouter le groupe à la carte et au contrôle des couches
      group.addTo(map);
      activeLayers[`Trace ${quality}`] = group;
    });
    
    // Ajouter des marqueurs spéciaux pour le début et la fin
    if (report.fixes.length > 0) {
      const first = report.fixes[0];
      const last = report.fixes[report.fixes.length - 1];
      
      const startMarker = L.divIcon({
        html: '🚀',
        className: 'gnss-special-marker',
        iconSize: [24, 24],
        popupAnchor: [0, -12]
      });
      
      const endMarker = L.divIcon({
        html: '🏁',
        className: 'gnss-special-marker',
        iconSize: [24, 24],
        popupAnchor: [0, -12]
      });
      
      L.marker([first.lat, first.lon], { icon: startMarker })
        .bindPopup('<b>Début de la trace</b>')
        .addTo(map);
        
      if (report.fixes.length > 1) {
        L.marker([last.lat, last. lon], { icon: endMarker })
          .bindPopup('<b>Fin de la trace</b>')
          .addTo(map);
      }
    }
    
    // Mettre à jour le contrôle des couches
    updateLayerControl();
  }
  
  // Créer le contenu du popup pour un point GNSS
  function createPopupContent(fix: PositionFix, index: number, total: number): string {
    const formatNumber = (num?: number, decimals = 2) => 
      num !== undefined ? num.toFixed(decimals) : 'N/A';
    
    return `
      <div class="gnss-popup">
        <div class="gnss-popup-header">
          <span class="gnss-popup-quality" style="background-color: ${fixColors[fix.quality || 'Unknown']}">
            ${fix.quality || 'Inconnu'}
          </span>
          <span class="gnss-popup-index">${index + 1} / ${total}</span>
        </div>
        <div class="gnss-popup-content">
          <div><b>Position:</b> ${formatNumber(fix.lat, 6)}, ${formatNumber(fix.lon, 6)}</div>
          ${fix.alt ? `<div><b>Altitude:</b> ${formatNumber(fix.alt)} m</div>` : ''}
          <div><b>Date/Heure:</b> ${new Date(fix.timestamp).toLocaleString()}</div>
          ${fix.hdop ? `<div><b>HDOP:</b> ${formatNumber(fix.hdop)}</div>` : ''}
          ${fix.vdop ? `<div><b>VDOP:</b> ${formatNumber(fix.vdop)}</div>` : ''}
          ${fix.pdop ? `<div><b>PDOP:</b> ${formatNumber(fix.pdop)}</div>` : ''}
          ${fix.metadata?.speed ? `<div><b>Vitesse:</b> ${formatNumber(fix.metadata.speed)} m/s</div>` : ''}
          ${fix.metadata?.heading ? `<div><b>Cap:</b> ${Math.round(fix.metadata.heading)}°</div>` : ''}
        </div>
      </div>
    `;
  }
  
  // Initialiser le contrôle des couches
  function initLayerControl() {
    if (layerControl) {
      map.removeControl(layerControl);
    }
    
    layerControl = L.control.layers(undefined, undefined, {
      collapsed: true,
      position: 'topright'
    }).addTo(map);
    
    updateLayerControl();
  }
  
  // Mettre à jour le contrôle des couches
  function updateLayerControl() {
    if (!layerControl) return;
    
    // Supprimer toutes les couches superposées
    Object.entries(activeLayers).forEach(([name, layer]) => {
      layerControl.removeLayer(layer);
    });
    
    // Réajouter les couches actives
    Object.entries(activeLayers).forEach(([name, layer]) => {
      layerControl.addOverlay(layer, name);
    });
  }
  
  // Calculer les limites des points GNSS
  function getFixesBounds(fixes: PositionFix[]): L.LatLngBounds {
    const bounds = L.latLngBounds(
      fixes.map(fix => [fix.lat, fix.lon] as L.LatLngTuple)
    );
    
    // S'assurer que la zone n'est pas trop petite
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      const point = bounds.getNorthEast();
      return L.latLngBounds(
        [point.lat - 0.001, point.lng - 0.001],
        [point.lat + 0.001, point.lng + 0.001]
      );
    }
    
    return bounds;
  }
  
  // Exporter les données en GeoJSON
  async function exportGeoJSON() {
    try {
      const geoJSON = await llmAssistant.exportToGeoJSON(report.fixes);
      const blob = new Blob([geoJSON], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      
      // Créer un lien de téléchargement
      const a = document.createElement('a');
      a.href = url;
      a.download = `trace-gnss-${report.missionId || 'sans-mission'}-${new Date().toISOString().split('T')[0]}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Journaliser l'export
      await fusionAuditLog.log({
        action: 'gnss_export',
        entityType: 'mission',
        entityId: report.missionId,
        details: {
          format: 'GeoJSON',
          fixCount: report.fixes.length
        }
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'export GeoJSON:', error);
      alert('Erreur lors de l\'export: ' + error.message);
    }
  }
  
  // Associer le rapport à la mission en cours
  async function attachToMission() {
    if (!report.missionId) {
      const currentMission = missionSync.getCurrentMission();
      if (currentMission) {
        report.missionId = currentMission.id;
        // Ici, vous pourriez sauvegarder les métadonnées mises à jour
      }
    }
  }
</script>

<div class="gnss-viewer" class:offline={isOffline}>
  <!-- En-tête -->
  <div class="gnss-header">
    <h2>
      {#if report.missionId}
        <span class="mission-badge">Mission #{report.missionId}</span>
      {/if}
      Visualisation des données GNSS
    </h2>
    
    <div class="gnss-actions">
      <button 
        class="btn btn-icon" 
        on:click|stopPropagation={() => showMetadata = !showMetadata}
        title="Afficher les métadonnées"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h.01a1 1 0 100-2H10V9z" clip-rule="evenodd" />
        </svg>
        <span>Métadonnées</span>
      </button>
      
      <button 
        class="btn btn-primary" 
        on:click|stopPropagation={exportGeoJSON}
        title="Exporter en GeoJSON"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
        <span>Exporter</span>
      </button>
    </div>
  </div>
  
  <!-- Contenu principal -->
  <div class="gnss-content">
    <!-- Panneau latéral des métadonnées -->
    {#if showMetadata}
      <div class="gnss-metadata" transition:fly={{
        x: -300,
        duration: 300
      }}>
        <div class="metadata-header">
          <h3>Métadonnées</h3>
          <button 
            class="btn-icon" 
            on:click|stopPropagation={() => showMetadata = false}
            title="Fermer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div class="metadata-content">
          {#if selectedFix}
            <div class="metadata-section">
              <h4>Position sélectionnée</h4>
              <div class="metadata-grid">
                <div class="metadata-item">
                  <span class="label">Latitude</span>
                  <span class="value">{selectedFix.lat.toFixed(6)}°</span>
                </div>
                <div class="metadata-item">
                  <span class="label">Longitude</span>
                  <span class="value">{selectedFix.lon.toFixed(6)}°</span>
                </div>
                {#if selectedFix.alt}
                  <div class="metadata-item">
                    <span class="label">Altitude</span>
                    <span class="value">{selectedFix.alt.toFixed(2)} m</span>
                  </div>
                {/if}
                <div class="metadata-item">
                  <span class="label">Date/Heure</span>
                  <span class="value">{new Date(selectedFix.timestamp).toLocaleString()}</span>
                </div>
                {#if selectedFix.quality}
                  <div class="metadata-item">
                    <span class="label">Qualité</span>
                    <span 
                      class="value quality-badge"
                      style="background-color: ${fixColors[selectedFix.quality] || fixColors['Unknown']}"
                    >
                      {selectedFix.quality}
                    </span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
          
          <div class="metadata-section">
            <h4>Résumé du vol</h4>
            <div class="metadata-grid">
              <div class="metadata-item">
                <span class="label">Durée</span>
                <span class="value">
                  {report.summary?.duration ? 
                    `${Math.floor(report.summary.duration / 60000)}m ${Math.floor((report.summary.duration % 60000) / 1000)}s` : 
                    'N/A'}
                </span>
              </div>
              <div class="metadata-item">
                <span class="label">Distance</span>
                <span class="value">
                  {report.summary?.distance ? 
                    `${report.summary.distance < 1000 ? 
                      `${Math.round(report.summary.distance)} m` : 
                      `${(report.summary.distance / 1000).toFixed(2)} km`}` : 
                    'N/A'}
                </span>
              </div>
              <div class="metadata-item">
                <span class="label">Vitesse moyenne</span>
                <span class="value">
                  {report.summary?.avgSpeed ? 
                    `${(report.summary.avgSpeed * 3.6).toFixed(1)} km/h` : 
                    'N/A'}
                </span>
              </div>
              <div class="metadata-item">
                <span class="label">Points GNSS</span>
                <span class="value">{report.fixes?.length || 0}</span>
              </div>
              {#if report.summary?.dominantMode}
                <div class="metadata-item">
                  <span class="label">Mode principal</span>
                  <span 
                    class="value quality-badge"
                    style="background-color: ${fixColors[report.summary.dominantMode] || fixColors['Unknown']}"
                  >
                    {report.summary.dominantMode}
                  </span>
                </div>
              {/if}
              {#if report.summary?.accuracyEstimate}
                <div class="metadata-item">
                  <span class="label">Précision estimée</span>
                  <span class="value">
                    {report.summary.accuracyEstimate < 1 ? 
                      `${Math.round(report.summary.accuracyEstimate * 100)} cm` : 
                      `${report.summary.accuracyEstimate.toFixed(1)} m`}
                  </span>
                </div>
              {/if}
            </div>
          </div>
          
          {#if report.metadata?.deviceInfo}
            <div class="metadata-section">
              <h4>Appareil</h4>
              <div class="metadata-grid">
                {#if report.metadata.deviceInfo.model}
                  <div class="metadata-item">
                    <span class="label">Modèle</span>
                    <span class="value">{report.metadata.deviceInfo.model}</span>
                  </div>
                {/if}
                {#if report.metadata.deviceInfo.firmware}
                  <div class="metadata-item">
                    <span class="label">Firmware</span>
                    <span class="value">{report.metadata.deviceInfo.firmware}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
    
    <!-- Carte -->
    <div 
      class="gnss-map-container" 
      class:sidebar-visible={showMetadata}
    >
      {#if isOffline}
        <div class="offline-banner">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 15.67 2 11.225 2 6c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span>Mode hors ligne activé</span>
        </div>
      {/if}
      
      <div 
        bind:this={mapContainer} 
        class="gnss-map"
      ></div>
      
      <div class="map-legend">
        <div class="legend-title">Légende</div>
        {#each Object.entries(fixColors) as [quality, color]}
          <div class="legend-item">
            <span class="legend-color" style="background-color: {color}"></span>
            <span class="legend-label">{quality}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* Variables */
  :global(:root) {
    --primary-color: #3b82f6;
    --primary-hover: #2563eb;
    --text-color: #1f2937;
    --text-muted: #6b7280;
    --bg-color: #ffffff;
    --border-color: #e5e7eb;
    --border-radius: 0.375rem;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --sidebar-width: 300px;
  }
  
  /* Styles de base */
  .gnss-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--bg-color);
    border-radius: var(--border-radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    position: relative;
  }
  
  /* En-tête */
  .gnss-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border-color);
    background-color: #f9fafb;
  }
  
  .gnss-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-color);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .mission-badge {
    background-color: var(--primary-color);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
  }
  
  .gnss-actions {
    display: flex;
    gap: 0.5rem;
  }
  
  /* Boutons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius);
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
    gap: 0.5rem;
  }
  
  .btn-icon {
    padding: 0.5rem;
    border-radius: 50%;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .btn-icon:hover {
    background-color: #f3f4f6;
    color: var(--text-color);
  }
  
  .btn-primary {
    background-color: var(--primary-color);
    color: white;
  }
  
  .btn-primary:hover {
    background-color: var(--primary-hover);
  }
  
  /* Contenu principal */
  .gnss-content {
    display: flex;
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  
  /* Panneau des métadonnées */
  .gnss-metadata {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background-color: var(--bg-color);
    border-left: 1px solid var(--border-color);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  }
  
  .metadata-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
  }
  
  .metadata-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .metadata-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }
  
  .metadata-section {
    margin-bottom: 1.5rem;
  }
  
  .metadata-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
  }
  
  .metadata-item {
    display: flex;
    flex-direction: column;
  }
  
  .label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }
  
  .value {
    font-size: 0.875rem;
    font-weight: 500;
    word-break: break-word;
  }
  
  .quality-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    text-align: center;
  }
  
  /* Conteneur de la carte */
  .gnss-map-container {
    flex: 1;
    position: relative;
    transition: margin-right 0.3s ease;
  }
  
  .gnss-map-container.sidebar-visible {
    margin-right: var(--sidebar-width);
  }
  
  .gnss-map {
    width: 100%;
    height: 100%;
    min-height: 400px;
  }
  
  /* Bannière hors ligne */
  .offline-banner {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background-color: #fef3c7;
    color: #92400e;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    z-index: 1000;
    box-shadow: var(--shadow);
  }
  
  .offline-banner svg {
    width: 1.25rem;
    height: 1.25rem;
  }
  
  /* Légende */
  .map-legend {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background-color: white;
    padding: 0.75rem;
    border-radius: var(--border-radius);
    box-shadow: var(--shadow);
    z-index: 1000;
    font-size: 0.75rem;
  }
  
  .legend-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--text-color);
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .legend-item:last-child {
    margin-bottom: 0;
  }
  
  .legend-color {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    margin-right: 0.5rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  /* Styles pour les marqueurs Leaflet */
  :global(.gnss-fix-marker) {
    transition: all 0.2s;
  }
  
  :global(.gnss-fix-marker:hover) {
    transform: scale(1.2);
    z-index: 1000 !important;
  }
  
  :global(.gnss-special-marker) {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    text-align: center;
  }
  
  /* Popup personnalisé */
  :global(.gnss-popup) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  
  :global(.gnss-popup-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  :global(.gnss-popup-quality) {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
  }
  
  :global(.gnss-popup-index) {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  :global(.gnss-popup-content) {
    margin-top: 0.5rem;
  }
  
  :global(.gnss-popup-content b) {
    font-weight: 600;
    color: #374151;
  }
  
  /* Mode hors ligne */
  .offline .gnss-map-container::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.7);
    z-index: 500;
    pointer-events: none;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .gnss-metadata {
      width: 100%;
      transform: translateX(100%);
    }
    
    .gnss-metadata.visible {
      transform: translateX(0);
    }
    
    .gnss-map-container.sidebar-visible {
      margin-right: 0;
    }
    
    .metadata-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
