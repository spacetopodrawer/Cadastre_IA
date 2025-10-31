<script lang="ts">
  import CadastreMap from './CadastreMap.svelte';
  import type { MapConfig } from '$lib/map';

  const config: MapConfig = {
    center: [48.85, 2.35],
    zoom: 12,
    layers: ['parcels', 'roads']
  };
</script>

<CadastreMap config={config} interactive={true} />
