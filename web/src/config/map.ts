/**
 * Configuración central del módulo de mapas.
 *
 * El estilo se resuelve desde VITE_MAP_STYLE_URL para poder cambiar de
 * proveedor (OpenFreeMap, MapTiler u otro compatible con MapLibre) sin
 * modificar los componentes.
 */
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

export const mapConfig = {
  styleUrl: readString(
    import.meta.env.VITE_MAP_STYLE_URL,
    DEFAULT_STYLE_URL,
  ),
  /** Grupo Pecuario S.A.C. — Av. Canto Bello 177, San Juan de Lurigancho. */
  center: {
    longitude: readNumber(import.meta.env.VITE_MAP_CENTER_LNG, -77.0138466),
    latitude: readNumber(import.meta.env.VITE_MAP_CENTER_LAT, -11.9805473),
  },
  zoom: readNumber(import.meta.env.VITE_MAP_ZOOM, 16),
  pitch: readNumber(import.meta.env.VITE_MAP_PITCH, 0),
  bearing: readNumber(import.meta.env.VITE_MAP_BEARING, 0),
  minZoom: 3,
  maxZoom: 21,
} as const;
