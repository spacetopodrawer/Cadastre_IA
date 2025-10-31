<script lang="ts">
  import { map, type MapConfig } from '$lib/map';
  import { parcelStore } from '$stores/parcels';
  export let config: MapConfig;
  export let interactive: boolean = true;
  $: map.initialize(config);
</script>

<div class="cadastre-map" bind:this={mapContainer}>
  <!-- Carte interactive -->
</div>

<style>
  .cadastre-map {
    @apply w-full h-full relative;
  }
</style>
