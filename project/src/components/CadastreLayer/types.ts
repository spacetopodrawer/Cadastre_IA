// Types pour les couches géographiques
export interface Layer {
  id: string;
  name: string;
  type: 'wms' | 'wfs' | 'geojson' | 'vector' | 'raster';
  url?: string;
  visible: boolean;
  opacity: number;
  zIndex: number;
  data?: any; // Données brutes de la couche
  metadata?: {
    description?: string;
    source?: string;
    createdAt?: string;
    updatedAt?: string;
    // Ajoutez d'autres métadonnées au besoin
  };
}

// Types pour les événements du composant
export interface LayerEvent {
  layerId: string;
  eventType: 'select' | 'visibility' | 'edit' | 'delete';
  data?: any;
}

// Types pour les props du composant
export interface CadastreLayerProps {
  layers: Layer[];
  selectedLayerId?: string | null;
  onLayerSelect?: (layerId: string) => void;
  onLayerEdit?: (layer: Layer) => void;
  onLayerDelete?: (layerId: string) => void;
}
