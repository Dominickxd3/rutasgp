import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildFeatureCollection } from './fleet.utils';
import {
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_LAYER_ID,
  SOURCE_ID,
  UNIT_HALO_LAYER_ID,
  UNIT_LABEL_LAYER_ID,
  UNIT_LAYER_ID,
} from './map.config';
export function createCompanyMarkerElement(onClose?: () => void): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'company-hq-marker';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Sede Grupo Pecuario S.A.C.');
  container.innerHTML = `
    <div class="company-hq-marker__card">
      <span class="company-hq-marker__icon pi pi-building"></span>
      <div class="company-hq-marker__details">
        <span class="company-hq-marker__title">Grupo Pecuario S.A.C.</span>
        <span class="company-hq-marker__subtitle">Sede Canto Bello 177</span>
      </div>
      <button class="company-hq-marker__close" type="button" aria-label="Cerrar">
        <span class="pi pi-times"></span>
      </button>
    </div>
  `;
  const closeBtn = container.querySelector('.company-hq-marker__close');
  closeBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose?.();
  });
  return container;
}
export async function loadVehicleImages(map: MapLibreMap): Promise<void> {
  const images: Array<[string, string]> = [
    ['fleet-truck-moving',  '/vehicles/camion ruta.png'],
    ['fleet-truck-stopped', '/vehicles/camion parado.png'],
    ['fleet-car-moving',    '/vehicles/camion ruta.png'],
    ['fleet-car-stopped',   '/vehicles/camion parado.png'],
  ];
  await Promise.all(
    images.map(async ([name, url]) => {
      if (map.hasImage(name)) {
        return;
      }
      try {
        const image = await map.loadImage(url);
        if (!map.hasImage(name)) {
          map.addImage(name, image.data, { pixelRatio: 3 });
        }
      } catch (error) {
        console.warn(`No se pudo cargar el marcador ${url}`, error);
      }
    }),
  );
}
export function addFleetLayers(map: MapLibreMap): void {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: buildFeatureCollection([]),
    cluster: true,
    clusterRadius: 70,      // agrupa más agresivamente cuando están cerca
    clusterMaxZoom: 16,     // hasta zoom 16 se muestran como cluster; a 17+ individuales
  });
  map.addLayer({
    id: CLUSTER_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#0f766e',
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['get', 'point_count'],
        2,
        18,
        10,
        23,
        30,
        27,
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
      'circle-opacity': 0.96,
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });
  // Halo verde suave para vehículos en movimiento (debajo del ícono)
  map.addLayer({
    id: UNIT_HALO_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'moving'], 1],
    ],
    paint: {
      'circle-color': '#16a34a',
      'circle-radius': 28,
      'circle-opacity': 0.15,
      'circle-blur': 0.4,
    },
  });
  // Ícono del vehículo (camion parado / camion ruta) — encima del halo
  map.addLayer({
    id: UNIT_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 0.22,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
  });
  map.addLayer({
    id: UNIT_LABEL_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'text-field': ['get', 'placa'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
      'text-allow-overlap': false,      // no solapar etiquetas entre sí
      'text-ignore-placement': false,   // respetar el espacio del ícono
      'text-optional': true,            // ocultarse si no hay espacio
    },
    paint: {
      'text-color': '#1e293b',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  });
}
