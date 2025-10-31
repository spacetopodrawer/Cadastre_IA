export type TileFormat = 'png' | 'jpeg' | 'pbf' | 'mvt' | 'geotiff' | 'mbtiles';
export type TileSourceType = 'osm' | 'mapbox' | 'drone' | 'generated' | 'mbtiles' | 'geotiff' | 'raster';

export interface TileSource {
  id: string;
  name: string;
  type: TileSourceType;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  zoomLevels: number[];
  projection: string;
  format: TileFormat;
  metadata?: {
    zone?: string;
    url?: string;
    [key: string]: any;
  };
}

export interface Tile {
  z: number;
  x: number;
  y: number;
  data: ArrayBuffer;
  format: TileFormat;
  source: string;
  sourceType: TileSourceType;
  timestamp: number;
  metadata?: {
    bounds?: [number, number, number, number];
    projection?: string;
    zoomLevels?: number[];
    zone?: string;
    [key: string]: any;
  };
}
