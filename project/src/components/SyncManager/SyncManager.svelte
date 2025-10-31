<script lang="ts">
  import { syncStore } from '$stores/syncStore';
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import IconRefresh from '$lib/icons/IconRefresh.svelte';
  import IconAlertCircle from '$lib/icons/IconAlertCircle.svelte';
  import IconCheckCircle from '$lib/icons/IconCheckCircle.svelte';
  import IconClock from '$lib/icons/IconClock.svelte';
  import IconWifiOff from '$lib/icons/IconWifiOff.svelte';
  import IconMoreVertical from '$lib/icons/IconMoreVertical.svelte';
  import IconX from '$lib/icons/IconX.svelte';
  import IconEye from '$lib/icons/IconEye.svelte';
  import IconGitMerge from '$lib/icons/IconGitMerge.svelte';

  export let showOnly: 'all' | 'synced' | 'pending' | 'conflict' | 'offline' = 'all';
  export let showActions = true;
  export let showAuditOnClick = true;
  export let maxItems: number | null = null;

  let showAuditFor: string | null = null;
  let showMenuFor: string | null = null;

  function getStatusIcon(status: string) {
    switch (status) {
      case 'synced':
        return IconCheckCircle;
      case 'pending':
        return IconClock;
      case 'conflict':
        return IconAlertCircle;
      case 'offline':
        return IconWifiOff;
      default:
        return null;
    }
  }

  function getStatusClass(status: string) {
    return `status-${status}`;
  }

  function handleSync(file: any) {
    syncStore.syncFile(file.id);
    closeMenus();
  }

  function handleResolve(file: any) {
    syncStore.resolveConflict(file.id);
    closeMenus();
  }

  function handleAudit(file: any) {
    if (showAuditOnClick) {
      showAuditFor = showAuditFor === file.id ? null : file.id;
    }
    syncStore.showAudit(file.id);
    closeMenus();
  }

  function closeMenus() {
    showMenuFor = null;
  }

  // Fermer les menus quand on clique ailleurs
  function handleClickOutside(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('.file-actions')) {
      closeMenus();
    }
  }

  // Nettoyer les écouteurs d'événements
  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  // Filtrer les fichiers selon showOnly
  $: filteredFiles = $syncStore.filter(file => 
    showOnly === 'all' ? true : file.status === showOnly
  ).slice(0, maxItems || undefined);

  // Formater la date de dernière synchronisation
  function formatDate(date: Date | undefined) {
    if (!date) return 'Jamais';
    return new Date(date).toLocaleString();
  }
</script>

<div class="sync-manager" on:click={handleClickOutside}>
  {#if $syncStore.length === 0}
    <div class="empty-state">
      <p>Aucun fichier à synchroniser</p>
    </div>
  {:else}
    <ul class="file-list" in:flap={{ duration: 200 }}>
      {#each filteredFiles as file (file.id)}
        <li class="file-item" in:fade out:fade>
          <div class="file-header">
            <div class="file-info">
              <div class="file-name">{file.name}</div>
              <div class="file-status {getStatusClass(file.status)}">
                <svelte:component 
                  this={getStatusIcon(file.status)} 
                  class="status-icon"
                />
                <span class="status-text">
                  {file.status === 'synced' ? 'Synchronisé' : 
                   file.status === 'pending' ? 'En attente' :
                   file.status === 'conflict' ? 'Conflit' : 'Hors ligne'}
                </span>
              </div>
            </div>
            
            {#if showActions}
              <div class="file-actions">
                <button 
                  class="action-button" 
                  on:click|stopPropagation={() => showMenuFor = showMenuFor === file.id ? null : file.id}
                  aria-label="Actions"
                >
                  <IconMoreVertical class="icon" />
                </button>
                
                {#if showMenuFor === file.id}
                  <div class="dropdown-menu" transition:fade>
                    <button 
                      class="dropdown-item" 
                      on:click|stopPropagation={() => handleSync(file)}
                      disabled={file.status === 'synced'}
                    >
                      <IconRefresh class="icon" />
                      <span>Synchroniser</span>
                    </button>
                    
                    {#if file.status === 'conflict'}
                      <button 
                        class="dropdown-item" 
                        on:click|stopPropagation={() => handleResolve(file)}
                      >
                        <IconGitMerge class="icon" />
                        <span>Résoudre le conflit</span>
                      </button>
                    {/if}
                    
                    <button 
                      class="dropdown-item" 
                      on:click|stopPropagation={() => handleAudit(file)}
                    >
                      <IconEye class="icon" />
                      <span>Voir l'audit</span>
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
          
          {#if showAuditFor === file.id}
            <div class="audit-log" in:fade>
              <div class="audit-header">
                <h4>Journal des modifications</h4>
                <button 
                  class="close-button" 
                  on:click|stopPropagation={() => showAuditFor = null}
                  aria-label="Fermer"
                >
                  <IconX class="icon" />
                </button>
              </div>
              <ul class="audit-entries">
                {#if file.audit.length === 0}
                  <li class="audit-entry">Aucune entrée d'audit</li>
                {:else}
                  {#each [...file.audit].reverse() as entry, i (i)}
                    <li class="audit-entry" in:fade delay={i * 50}>
                      {entry.split(': ')[1]}
                      <span class="audit-time">{entry.split('T')[0]}</span>
                    </li>
                  {/each}
                {/if}
              </ul>
            </div>
          {/if}
          
          <div class="file-meta">
            <span class="last-synced">
              Dernière synchro: {formatDate(file.lastSynced)}
            </span>
            {#if file.type}
              <span class="file-type">{file.type}</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .sync-manager {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --color-primary: #3b82f6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-danger: #ef4444;
    --color-muted: #6b7280;
    --color-bg: #ffffff;
    --color-bg-hover: #f9fafb;
    --color-border: #e5e7eb;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --radius-sm: 0.375rem;
    --radius-md: 0.5rem;
    --transition: all 0.2s ease-in-out;
  }

  .empty-state {
    padding: 1.5rem;
    text-align: center;
    color: var(--color-muted);
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-item {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    transition: var(--transition);
  }

  .file-item:hover {
    box-shadow: var(--shadow-sm);
  }

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 500;
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    background: var(--color-bg-hover);
  }

  .status-icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  .status-synced {
    color: var(--color-success);
  }

  .status-pending {
    color: var(--color-warning);
  }

  .status-conflict {
    color: var(--color-danger);
  }

  .status-offline {
    color: var(--color-muted);
  }

  .file-actions {
    position: relative;
  }

  .action-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted);
    transition: var(--transition);
  }

  .action-button:hover {
    background: var(--color-bg-hover);
    color: var(--color-primary);
  }

  .dropdown-menu {
    position: absolute;
    right: 0;
    top: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 10;
    min-width: 12rem;
    overflow: hidden;
    margin-top: 0.25rem;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 1rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-muted);
    transition: var(--transition);
  }

  .dropdown-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-primary);
  }

  .dropdown-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .dropdown-item .icon {
    width: 1rem;
    height: 1rem;
  }

  .audit-log {
    margin-top: 1rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.75rem;
  }

  .audit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .audit-header h4 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--color-muted);
    border-radius: 0.25rem;
    transition: var(--transition);
  }

  .close-button:hover {
    background: var(--color-bg-hover);
    color: var(--color-danger);
  }

  .audit-entries {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 12rem;
    overflow-y: auto;
  }

  .audit-entry {
    font-size: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .audit-entry:last-child {
    border-bottom: none;
  }

  .audit-time {
    color: var(--color-muted);
    font-size: 0.6875rem;
    white-space: nowrap;
  }

  .file-meta {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.6875rem;
    color: var(--color-muted);
  }

  .file-type {
    text-transform: capitalize;
    background: var(--color-bg-hover);
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.625rem;
    font-weight: 500;
  }

  /* Animations */
  .fade-enter-active, .fade-leave-active {
    transition: opacity 0.15s ease;
  }
  .fade-enter, .fade-leave-to {
    opacity: 0;
  }

  .flap {
    animation: flap 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes flap {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
