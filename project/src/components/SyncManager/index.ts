import SyncManager from './SyncManager.svelte';

export default SyncManager;

export * from '$stores/syncStore';

export type { SyncedFile, SyncStatus } from '$stores/syncStore';
  