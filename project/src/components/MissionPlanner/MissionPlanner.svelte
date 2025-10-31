<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { DroneMissionPlanner } from '$lib/mission/DroneMissionPlanner';
  import { remoteLinkManager } from '$lib/network/RemoteLinkManager';
  import { deviceSecurityPolicy } from '$lib/security/DeviceSecurityPolicy';
  import { fusionAuditLog } from '$lib/security/FusionAuditLog';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Map, Marker, Popup, TileLayer } from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { Icon } from 'leaflet';
  
  // Configuration des icônes Leaflet
  const defaultIcon = new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // État du formulaire
  let missionName = '';
  let missionDescription = '';
  let altitude = 50;
  let resolution = 'high' as const;
  let overlap = { front: 70, side: 60 };
  let speed = 5;
  let selectedDevice = '';
  let selectedGimbalPitch = -90;
  let heading = 'north' as const;
  
  // État de l'interface
  let activeTab = 'planning';
  let isLoading = true;
  let devices = [];
  let missions = [];
  let map;
  let mapContainer;
  let markers = [];
  let selectedMission = null;
  let missionStats = {
    total: 0,
    completed: 0,
    inProgress: 0,
    failed: 0
  };

  // Options de sélection
  const resolutionOptions = [
    { value: 'low', label: 'Basse (10cm/px)' },
    { value: 'medium', label: 'Moyenne (5cm/px)' },
    { value: 'high', label: 'Haute (2cm/px)' }
  ];

  const headingOptions = [
    { value: 'north', label: 'Nord' },
    { value: 'south', label: 'Sud' },
    { value: 'east', label: 'Est' },
    { value: 'west', label: 'Ouest' }
  ];

  // Chargement initial
  onMount(async () => {
    await loadDevices();
    await loadMissions();
    initMap();
    
    // S'abonner aux mises à jour en temps réel
    const unsubscribe = remoteLinkManager.subscribeToDeviceUpdates(handleDeviceUpdate);
    
    // Nettoyer à la destruction du composant
    return () => {
      unsubscribe();
      if (map) map.remove();
    };
  });

  // Charger la liste des appareils disponibles
  async function loadDevices() {
    try {
      isLoading = true;
      const availableDevices = await remoteLinkManager.listDevices();
      devices = availableDevices.filter(d => d.type === 'drone');
      
      if (devices.length > 0 && !selectedDevice) {
        selectedDevice = devices[0].id;
      }
    } catch (error) {
      console.error('Erreur lors du chargement des appareils:', error);
      showError('Impossible de charger les appareils');
    } finally {
      isLoading = false;
    }
  }

  // Charger les missions existantes
  async function loadMissions() {
    try {
      isLoading = true;
      missions = DroneMissionPlanner.listMissions({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 derniers jours
      });
      
      updateMissionStats();
      updateMapMarkers();
    } catch (error) {
      console.error('Erreur lors du chargement des missions:', error);
      showError('Impossible de charger les missions');
    } finally {
      isLoading = false;
    }
  }

  // Initialiser la carte Leaflet
  function initMap() {
    if (!mapContainer) return;
    
    // Coordonnées par défaut (Paris)
    const defaultCoords = [48.8566, 2.3522];
    
    map = new Map(mapContainer).setView(defaultCoords, 15);
    
    // Ajouter la couche de tuiles OpenStreetMap
    new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // Gestion du clic sur la carte pour définir la zone
    map.on('click', (e) => {
      // Implémenter la logique de dessin de polygone ici
      console.log('Coordonnées cliquées:', e.latlng);
    });
    
    updateMapMarkers();
  }
  
  // Mettre à jour les marqueurs sur la carte
  function updateMapMarkers() {
    if (!map) return;
    
    // Supprimer les anciens marqueurs
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Ajouter un marqueur pour chaque mission
    missions.forEach(mission => {
      if (!mission.zone?.coordinates?.length) return;
      
      // Prendre le premier point comme emplacement du marqueur
      const firstPoint = mission.zone.coordinates[0];
      const marker = new Marker([firstPoint.latitude, firstPoint.longitude], {
        icon: getMissionMarkerIcon(mission)
      })
      .addTo(map)
      .bindPopup(`
        <b>${mission.name}</b><br>
        Statut: ${formatStatus(mission.status)}<br>
        Altitude: ${mission.altitude}m<br>
        Résolution: ${mission.resolution}
      `);
      
      marker.on('click', () => selectMission(mission.id));
      markers.push(marker);
    });
  }
  
  // Obtenir l'icône appropriée pour le statut de la mission
  function getMissionMarkerIcon(mission) {
    const iconUrl = getStatusIcon(mission.status);
    return new Icon({
      iconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  }
  
  // Mettre à jour les statistiques des missions
  function updateMissionStats() {
    missionStats = {
      total: missions.length,
      completed: missions.filter(m => m.status === 'completed').length,
      inProgress: missions.filter(m => m.status === 'in_progress').length,
      failed: missions.filter(m => m.status === 'failed').length
    };
  }
  
  // Gérer les mises à jour des appareils
  function handleDeviceUpdate(device) {
    // Mettre à jour la liste des appareils si nécessaire
    const deviceIndex = devices.findIndex(d => d.id === device.id);
    if (deviceIndex !== -1) {
      devices[deviceIndex] = { ...devices[deviceIndex], ...device };
      devices = [...devices]; // Forcer la réactivité
    }
  }
  
  // Créer une nouvelle mission
  async function createMission() {
    if (!missionName.trim() || !selectedDevice) {
      showError('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    try {
      isLoading = true;
      
      // Créer une zone de mission factice (à remplacer par la sélection sur la carte)
      const missionZone = {
        name: `Zone ${missionName}`,
        type: 'polygon',
        coordinates: [
          { latitude: 48.8566, longitude: 2.3522 },
          { latitude: 48.8566, longitude: 2.3622 },
          { latitude: 48.8466, longitude: 2.3622 },
          { latitude: 48.8466, longitude: 2.3522 }
        ]
      };
      
      // Créer la mission
      const mission = DroneMissionPlanner.createMission({
        name: missionName,
        description: missionDescription,
        zone: missionZone,
        altitude: Math.max(10, Math.min(altitude, 120)),
        resolution,
        overlap,
        speed,
        heading,
        gimbalPitch: selectedGimbalPitch,
        assignedTo: selectedDevice,
        createdBy: 'current-user-id', // Remplacer par l'ID de l'utilisateur connecté
        metadata: {
          createdBy: 'Utilisateur actuel', // Remplacer par le nom de l'utilisateur
          createdAt: new Date().toISOString()
        }
      });
      
      // Journaliser la création de la mission
      await fusionAuditLog.logSecurityEvent({
        action: 'mission_created',
        deviceId: selectedDevice,
        userId: 'current-user-id',
        details: {
          missionId: mission.id,
          missionName: mission.name,
          resolution: mission.resolution,
          altitude: mission.altitude
        },
        status: 'success'
      });
      
      // Recharger la liste des missions
      await loadMissions();
      
      // Réinitialiser le formulaire
      missionName = '';
      missionDescription = '';
      
      // Afficher un message de succès
      showSuccess('Mission créée avec succès');
      
    } catch (error) {
      console.error('Erreur lors de la création de la mission:', error);
      showError('Erreur lors de la création de la mission');
      
      // Journaliser l'échec
      await fusionAuditLog.logSecurityEvent({
        action: 'mission_create_failed',
        deviceId: selectedDevice,
        userId: 'current-user-id',
        details: {
          error: error instanceof Error ? error.message : String(error),
          missionName
        },
        status: 'error'
      });
    } finally {
      isLoading = false;
    }
  }
  
  // Lancer une mission existante
  async function launchMission(missionId: string) {
    try {
      isLoading = true;
      const success = await DroneMissionPlanner.launchMission(missionId);
      
      if (success) {
        showSuccess('Mission lancée avec succès');
        await loadMissions(); // Mettre à jour la liste des missions
      } else {
        throw new Error('Échec du lancement de la mission');
      }
    } catch (error) {
      console.error('Erreur lors du lancement de la mission:', error);
      showError('Erreur lors du lancement de la mission');
    } finally {
      isLoading = false;
    }
  }
  
  // Annuler une mission en cours
  async function cancelMission(missionId: string) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette mission ?')) return;
    
    try {
      isLoading = true;
      const success = await DroneMissionPlanner.cancelMission(missionId, 'Annulée par l\'utilisateur');
      
      if (success) {
        showSuccess('Mission annulée avec succès');
        await loadMissions(); // Mettre à jour la liste des missions
      } else {
        throw new Error('Échec de l\'annulation de la mission');
      }
    } catch (error) {
      console.error('Erreur lors de l\'annulation de la mission:', error);
      showError('Erreur lors de l\'annulation de la mission');
    } finally {
      isLoading = false;
    }
  }
  
  // Sélectionner une mission
  function selectMission(missionId: string) {
    selectedMission = missions.find(m => m.id === missionId) || null;
    
    // Centrer la carte sur la mission sélectionnée
    if (selectedMission?.zone?.coordinates?.length) {
      const firstPoint = selectedMission.zone.coordinates[0];
      map?.setView([firstPoint.latitude, firstPoint.longitude], 16);
    }
  }
  
  // Formater le statut pour l'affichage
  function formatStatus(status: string): string {
    const statusMap = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminée',
      failed: 'Échouée',
      cancelled: 'Annulée',
      paused: 'En pause'
    };
    return statusMap[status] || status;
  }
  
  // Obtenir l'icône de statut
  function getStatusIcon(status: string): string {
    const iconMap = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '⛔',
      paused: '⏸️'
    };
    return iconMap[status] || '❓';
  }
  
  // Afficher un message d'erreur
  function showError(message: string) {
    // Implémenter une notification ou un toast
    alert(`Erreur: ${message}`);
  }
  
  // Afficher un message de succès
  function showSuccess(message: string) {
    // Implémenter une notification ou un toast
    alert(`Succès: ${message}`);
  }
</script>

<div class="mission-planner">
  <header class="header">
    <h1>🛰️ Planificateur de missions drone</h1>
    <div class="tabs">
      <button 
        class:active={activeTab === 'planning'}
        on:click={() => activeTab = 'planning'}
      >
        📝 Planification
      </button>
      <button 
        class:active={activeTab === 'missions'}
        on:click={() => activeTab = 'missions'}
      >
        📋 Missions ({missions.length})
      </button>
      <button 
        class:active={activeTab === 'map'}
        on:click={() => activeTab = 'map'}
      >
        🗺️ Carte
      </button>
    </div>
  </header>

  {#if activeTab === 'planning'}
    <div class="planning-tab">
      <div class="form-container">
        <h2>✏️ Nouvelle mission</h2>
        
        <div class="form-group">
          <label for="mission-name">Nom de la mission *</label>
          <input 
            id="mission-name"
            type="text" 
            bind:value={missionName}
            placeholder="Ex: Inspection parcelle 45B"
            disabled={isLoading}
          />
        </div>
        
        <div class="form-group">
          <label for="mission-description">Description</label>
          <textarea
            id="mission-description"
            bind:value={missionDescription}
            placeholder="Décrivez l'objectif de cette mission..."
            rows="3"
            disabled={isLoading}
          ></textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="altitude">Altitude (m) *</label>
            <input 
              id="altitude"
              type="number" 
              bind:value={altitude}
              min="10"
              max="120"
              step="1"
              disabled={isLoading}
            />
          </div>
          
          <div class="form-group">
            <label for="resolution">Résolution *</label>
            <select 
              id="resolution" 
              bind:value={resolution}
              disabled={isLoading}
            >
              {#each resolutionOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="overlap-front">Recouvrement avant/arrière (%)</label>
            <input 
              id="overlap-front"
              type="range" 
              bind:value={overlap.front}
              min="0"
              max="100"
              step="5"
              disabled={isLoading}
            />
            <span class="range-value">{overlap.front}%</span>
          </div>
          
          <div class="form-group">
            <label for="overlap-side">Recouvrement latéral (%)</label>
            <input 
              id="overlap-side"
              type="range" 
              bind:value={overlap.side}
              min="0"
              max="100"
              step="5"
              disabled={isLoading}
            />
            <span class="range-value">{overlap.side}%</span>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="speed">Vitesse (m/s)</label>
            <input 
              id="speed"
              type="number" 
              bind:value={speed}
              min="1"
              max="15"
              step="0.5"
              disabled={isLoading}
            />
          </div>
          
          <div class="form-group">
            <label for="heading">Direction</label>
            <select 
              id="heading" 
              bind:value={heading}
              disabled={isLoading}
            >
              {#each headingOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label for="gimbal-pitch">Angle de la caméra (degrés)</label>
          <input 
            id="gimbal-pitch"
            type="range" 
            bind:value={selectedGimbalPitch}
            min="-90"
            max="0"
            step="5"
            disabled={isLoading}
          />
          <span class="range-value">{selectedGimbalPitch}°</span>
        </div>
        
        <div class="form-group">
          <label for="device">Drone *</label>
          <select 
            id="device" 
            bind:value={selectedDevice}
            disabled={isLoading || devices.length === 0}
          >
            {#if devices.length === 0}
              <option value="">Aucun drone disponible</option>
            {:else}
              <option value="">Sélectionnez un drone</option>
              {#each devices as device}
                <option value={device.id}>
                  {device.name} ({device.type})
                </option>
              {/each}
            {/if}
          </select>
          {#if devices.length === 0}
            <p class="hint">Aucun drone n'est actuellement disponible. Vérifiez la connexion des appareils.</p>
          {/if}
        </div>
        
        <div class="form-actions">
          <button 
            class="primary" 
            on:click={createMission}
            disabled={isLoading || !missionName.trim() || !selectedDevice}
          >
            {isLoading ? 'Traitement...' : 'Créer la mission'}
          </button>
        </div>
      </div>
      
      <div class="map-preview">
        <h3>Zone de mission</h3>
        <div class="map-container" bind:this={mapContainer}>
          <p>Chargement de la carte...</p>
        </div>
        <p class="hint">Cliquez sur la carte pour définir la zone de mission.</p>
      </div>
    </div>
  
  {:else if activeTab === 'missions'}
    <div class="missions-tab">
      <div class="stats">
        <div class="stat">
          <div class="stat-value">{missionStats.total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat in-progress">
          <div class="stat-value">{missionStats.inProgress}</div>
          <div class="stat-label">En cours</div>
        </div>
        <div class="stat completed">
          <div class="stat-value">{missionStats.completed}</div>
          <div class="stat-label">Terminées</div>
        </div>
        <div class="stat failed">
          <div class="stat-value">{missionStats.failed}</div>
          <div class="stat-label">Échouées</div>
        </div>
      </div>
      
      <div class="missions-list">
        <h2>📋 Liste des missions</h2>
        
        {#if isLoading && missions.length === 0}
          <div class="loading">Chargement des missions...</div>
        {:else if missions.length === 0}
          <div class="empty-state">
            <p>Aucune mission n'a été créée pour le moment.</p>
            <button on:click={() => activeTab = 'planning'} class="primary">
              Créer une mission
            </button>
          </div>
        {:else}
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Statut</th>
                  <th>Drone</th>
                  <th>Altitude</th>
                  <th>Résolution</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each missions as mission (mission.id)}
                  <tr 
                    class:selected={selectedMission?.id === mission.id}
                    on:click={() => selectMission(mission.id)}
                  >
                    <td class="mission-name">
                      <span class="status-indicator {mission.status}"></span>
                      {mission.name}
                    </td>
                    <td>
                      <span class="status-badge {mission.status}">
                        {getStatusIcon(mission.status)} {formatStatus(mission.status)}
                      </span>
                    </td>
                    <td>{devices.find(d => d.id === mission.assignedTo)?.name || 'Inconnu'}</td>
                    <td>{mission.altitude}m</td>
                    <td>{mission.resolution}</td>
                    <td>{new Date(mission.createdAt).toLocaleString()}</td>
                    <td class="actions">
                      {#if mission.status === 'pending'}
                        <button 
                          class="icon-button" 
                          title="Lancer la mission"
                          on:click|stopPropagation={() => launchMission(mission.id)}
                        >
                          🚀
                        </button>
                      {:else if mission.status === 'in_progress'}
                        <button 
                          class="icon-button warning" 
                          title="Annuler la mission"
                          on:click|stopPropagation={() => cancelMission(mission.id)}
                        >
                          ⛔
                        </button>
                      {/if}
                      
                      <button 
                        class="icon-button" 
                        title="Voir les détails"
                        on:click|stopPropagation={() => selectMission(mission.id)}
                      >
                        🔍
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      
      {#if selectedMission}
        <div class="mission-details" in:fly={{ y: 20, duration: 200, easing: cubicOut }}>
          <div class="details-header">
            <h3>Détails de la mission</h3>
            <button class="close-button" on:click={() => selectedMission = null}>×</button>
          </div>
          
          <div class="details-content">
            <h4>{selectedMission.name}</h4>
            <p class="mission-description">{selectedMission.description || 'Aucune description'}</p>
            
            <div class="details-grid">
              <div class="detail">
                <span class="detail-label">Statut:</span>
                <span class="detail-value">
                  <span class="status-badge {selectedMission.status}">
                    {getStatusIcon(selectedMission.status)} {formatStatus(selectedMission.status)}
                  </span>
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Date de création:</span>
                <span class="detail-value">
                  {new Date(selectedMission.createdAt).toLocaleString()}
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Début:</span>
                <span class="detail-value">
                  {selectedMission.startedAt 
                    ? new Date(selectedMission.startedAt).toLocaleString() 
                    : '-'}
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Fin:</span>
                <span class="detail-value">
                  {selectedMission.completedAt 
                    ? new Date(selectedMission.completedAt).toLocaleString() 
                    : selectedMission.status === 'in_progress' ? 'En cours...' : '-'}
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Drone assigné:</span>
                <span class="detail-value">
                  {devices.find(d => d.id === selectedMission.assignedTo)?.name || 'Inconnu'}
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Altitude:</span>
                <span class="detail-value">{selectedMission.altitude}m</span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Résolution:</span>
                <span class="detail-value">{selectedMission.resolution}</span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Photos prévues:</span>
                <span class="detail-value">{selectedMission.photosCount || 'N/A'}</span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Distance estimée:</span>
                <span class="detail-value">
                  {selectedMission.distance ? `${selectedMission.distance.toFixed(2)}m` : 'N/A'}
                </span>
              </div>
              
              <div class="detail">
                <span class="detail-label">Durée estimée:</span>
                <span class="detail-value">
                  {selectedMission.estimatedTime 
                    ? `${Math.floor(selectedMission.estimatedTime / 60)}m ${selectedMission.estimatedTime % 60}s` 
                    : 'N/A'}
                </span>
              </div>
            </div>
            
            <div class="details-actions">
              {#if selectedMission.status === 'pending'}
                <button 
                  class="primary" 
                  on:click={() => launchMission(selectedMission.id)}
                >
                  🚀 Lancer la mission
                </button>
              {:else if selectedMission.status === 'in_progress'}
                <button 
                  class="warning" 
                  on:click={() => cancelMission(selectedMission.id)}
                >
                  ⛔ Annuler la mission
                </button>
              {/if}
              
              <button 
                class="secondary" 
                on:click={() => {
                  // Implémenter la vue sur la carte
                  activeTab = 'map';
                  // Centrer sur la mission
                  if (selectedMission.zone?.coordinates?.length) {
                    const firstPoint = selectedMission.zone.coordinates[0];
                    map?.setView([firstPoint.latitude, firstPoint.longitude], 16);
                  }
                }}
              >
                🗺️ Voir sur la carte
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  
  {:else if activeTab === 'map'}
    <div class="map-tab">
      <div class="map-container" bind:this={mapContainer}>
        <p>Chargement de la carte...</p>
      </div>
      
      <div class="map-controls">
        <div class="map-legend">
          <h4>Légende</h4>
          <div class="legend-item">
            <span class="legend-icon pending">⏳</span>
            <span>En attente</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon in_progress">🔄</span>
            <span>En cours</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon completed">✅</span>
            <span>Terminée</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon failed">❌</span>
            <span>Échouée</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon cancelled">⛔</span>
            <span>Annulée</span>
          </div>
        </div>
        
        <div class="map-actions">
          <button class="secondary" on:click={() => map?.setView([48.8566, 2.3522], 13)}>
            Centrer sur Paris
          </button>
          <button class="secondary" on:click={() => {
            if (missions.length > 0) {
              const bounds = [];
              missions.forEach(mission => {
                if (mission.zone?.coordinates) {
                  mission.zone.coordinates.forEach(coord => {
                    bounds.push([coord.latitude, coord.longitude]);
                  });
                }
              });
              
              if (bounds.length > 0) {
                map?.fitBounds(bounds, { padding: [50, 50] });
              }
            }
          }}>
            Afficher toutes les missions
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <div class="status-bar">
    <div class="status-message">
      {#if isLoading}
        <span class="loading-spinner">⏳</span> Chargement...
      {:else}
        {missions.length} mission{missions.length !== 1 ? 's' : ''} au total
      {/if}
    </div>
    <div class="last-updated">
      Dernière mise à jour: {new Date().toLocaleTimeString()}
    </div>
  </div>
</div>

<style>
  /* Variables de thème */
  :global(:root) {
    --primary-color: #4a6cf7;
    --primary-hover: #3a5ce4;
    --secondary-color: #6c757d;
    --success-color: #28a745;
    --warning-color: #ffc107;
    --danger-color: #dc3545;
    --light-color: #f8f9fa;
    --dark-color: #343a40;
    --border-color: #dee2e6;
    --border-radius: 6px;
    --box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    --transition: all 0.2s ease-in-out;
  }
  
  /* Styles de base */
  .mission-planner {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #f5f7fb;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #333;
  }
  
  .header {
    background-color: white;
    padding: 1rem 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    z-index: 10;
  }
  
  .header h1 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    color: var(--dark-color);
  }
  
  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border-color);
    margin: 0 -2rem;
    padding: 0 2rem;
  }
  
  .tabs button {
    background: none;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--secondary-color);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: var(--transition);
  }
  
  .tabs button:hover {
    color: var(--primary-color);
  }
  
  .tabs button.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }
  
  /* Styles des onglets */
  .planning-tab {
    display: flex;
    flex: 1;
    gap: 2rem;
    padding: 2rem;
    overflow: hidden;
  }
  
  .form-container {
    flex: 0 0 400px;
    background: white;
    border-radius: var(--border-radius);
    padding: 1.5rem;
    box-shadow: var(--box-shadow);
    overflow-y: auto;
  }
  
  .map-preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
    overflow: hidden;
  }
  
  .map-container {
    flex: 1;
    min-height: 400px;
    background: #e9ecef;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary-color);
  }
  
  /* Styles du formulaire */
  .form-group {
    margin-bottom: 1.25rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    font-size: 0.9rem;
    color: #495057;
  }
  
  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-size: 0.95rem;
    transition: var(--transition);
  }
  
  .form-group input[type="range"] {
    width: calc(100% - 3rem);
    margin-right: 0.5rem;
    vertical-align: middle;
  }
  
  .form-group textarea {
    min-height: 80px;
    resize: vertical;
  }
  
  .form-row {
    display: flex;
    gap: 1rem;
  }
  
  .form-row .form-group {
    flex: 1;
  }
  
  .range-value {
    display: inline-block;
    min-width: 2.5rem;
    text-align: right;
    font-size: 0.9rem;
    color: var(--secondary-color);
  }
  
  .hint {
    font-size: 0.8rem;
    color: var(--secondary-color);
    margin-top: 0.25rem;
    font-style: italic;
  }
  
  .form-actions {
    margin-top: 2rem;
    text-align: right;
  }
  
  button {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: var(--border-radius);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: var(--transition);
  }
  
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  button.primary {
    background-color: var(--primary-color);
    color: white;
  }
  
  button.primary:not(:disabled):hover {
    background-color: var(--primary-hover);
  }
  
  button.secondary {
    background-color: white;
    border: 1px solid var(--border-color);
    color: var(--dark-color);
  }
  
  button.secondary:hover {
    background-color: #f8f9fa;
  }
  
  button.warning {
    background-color: var(--warning-color);
    color: #212529;
  }
  
  button.warning:hover {
    background-color: #e0a800;
  }
  
  button.danger {
    background-color: var(--danger-color);
    color: white;
  }
  
  button.danger:hover {
    background-color: #c82333;
  }
  
  .icon-button {
    background: none;
    border: none;
    font-size: 1.2rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    opacity: 0.7;
    transition: var(--transition);
  }
  
  .icon-button:hover {
    opacity: 1;
    transform: scale(1.1);
  }
  
  .icon-button.warning {
    color: var(--warning-color);
  }
  
  /* Styles de l'onglet des missions */
  .missions-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 2rem;
    gap: 1.5rem;
  }
  
  .stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .stat {
    flex: 1;
    background: white;
    border-radius: var(--border-radius);
    padding: 1rem;
    text-align: center;
    box-shadow: var(--box-shadow);
  }
  
  .stat.in-progress {
    border-top: 3px solid var(--primary-color);
  }
  
  .stat.completed {
    border-top: 3px solid var(--success-color);
  }
  
  .stat.failed {
    border-top: 3px solid var(--danger-color);
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  
  .stat-label {
    font-size: 0.85rem;
    color: var(--secondary-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .missions-list {
    flex: 1;
    background: white;
    border-radius: var(--border-radius);
    padding: 1.5rem;
    box-shadow: var(--box-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .missions-list h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    font-size: 1.25rem;
    color: var(--dark-color);
  }
  
  .table-container {
    flex: 1;
    overflow-y: auto;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  
  th, td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }
  
  th {
    font-weight: 600;
    color: #495057;
    background-color: #f8f9fa;
    position: sticky;
    top: 0;
    z-index: 5;
  }
  
  tr {
    transition: var(--transition);
  }
  
  tr:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
  
  tr:hover {
    background-color: #f8f9fa;
  }
  
  tr.selected {
    background-color: #e9f0ff;
  }
  
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
  }
  
  .status-badge.pending {
    background-color: #fff3cd;
    color: #856404;
  }
  
  .status-badge.in_progress {
    background-color: #cce5ff;
    color: #004085;
  }
  
  .status-badge.completed {
    background-color: #d4edda;
    color: #155724;
  }
  
  .status-badge.failed {
    background-color: #f8d7da;
    color: #721c24;
  }
  
  .status-badge.cancelled {
    background-color: #e2e3e5;
    color: #383d41;
  }
  
  .mission-name {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .status-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  
  .status-indicator.pending {
    background-color: #ffc107;
  }
  
  .status-indicator.in_progress {
    background-color: #007bff;
  }
  
  .status-indicator.completed {
    background-color: #28a745;
  }
  
  .status-indicator.failed {
    background-color: #dc3545;
  }
  
  .status-indicator.cancelled {
    background-color: #6c757d;
  }
  
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  
  /* Détails de la mission */
  .mission-details {
    position: fixed;
    top: 0;
    right: 0;
    width: 450px;
    height: 100%;
    background: white;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
    z-index: 100;
    display: flex;
    flex-direction: column;
  }
  
  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }
  
  .details-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--secondary-color);
    padding: 0.25rem 0.75rem;
    line-height: 1;
    border-radius: 4px;
  }
  
  .close-button:hover {
    background-color: #f8f9fa;
  }
  
  .details-content {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }
  
  .details-content h4 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.1rem;
    color: var(--dark-color);
  }
  
  .mission-description {
    color: var(--secondary-color);
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }
  
  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .detail {
    display: flex;
    flex-direction: column;
  }
  
  .detail-label {
    font-size: 0.8rem;
    color: var(--secondary-color);
    margin-bottom: 0.25rem;
  }
  
  .detail-value {
    font-weight: 500;
    word-break: break-word;
  }
  
  .details-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-color);
  }
  
  .details-actions button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  
  /* Styles de l'onglet carte */
  .map-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
  }
  
  .map-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    display: flex;
    gap: 1rem;
  }
  
  .map-legend {
    background: white;
    border-radius: var(--border-radius);
    padding: 1rem;
    box-shadow: var(--box-shadow);
    width: 180px;
  }
  
  .map-legend h4 {
    margin-top: 0;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    color: var(--dark-color);
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  
  .legend-icon {
    font-size: 1rem;
    width: 20px;
    text-align: center;
  }
  
  .map-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  /* État vide et chargement */
  .empty-state, .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem;
    text-align: center;
    color: var(--secondary-color);
  }
  
  .empty-state p {
    margin-bottom: 1.5rem;
    max-width: 400px;
  }
  
  /* Barre d'état */
  .status-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 2rem;
    background-color: white;
    border-top: 1px solid var(--border-color);
    font-size: 0.85rem;
    color: var(--secondary-color);
  }
  
  .loading-spinner {
    display: inline-block;
    margin-right: 0.5rem;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Réactivité */
  @media (max-width: 1200px) {
    .planning-tab {
      flex-direction: column;
    }
    
    .form-container, .map-preview {
      flex: none;
      width: 100%;
    }
    
    .details-grid {
      grid-template-columns: 1fr;
    }
    
    .mission-details {
      width: 100%;
      height: 60%;
      bottom: 0;
      top: auto;
    }
  }
  
  @media (max-width: 768px) {
    .header {
      padding: 1rem;
    }
    
    .missions-tab, .planning-tab {
      padding: 1rem;
    }
    
    .stats {
      flex-direction: column;
    }
    
    .details-actions {
      flex-direction: column;
    }
    
    .tabs {
      overflow-x: auto;
      padding: 0 1rem;
      margin: 0 -1rem;
      -webkit-overflow-scrolling: touch;
    }
    
    .tabs::-webkit-scrollbar {
      display: none;
    }
  }
</style>
