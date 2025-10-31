import { render } from '@testing-library/svelte';
import CadastreMap from './CadastreMap.svelte';
import type { MapConfig } from '$lib/map';

describe('CadastreMap', () => {
  const config: MapConfig = {
    center: [48.85, 2.35],
    zoom: 12,
    layers: ['parcels', 'roads']
  };

  it('renders correctly', () => {
    const { container } = render(CadastreMap, { props: { config, interactive: true } });
    expect(container.querySelector('.cadastre-map')).toBeTruthy();
  });
});
