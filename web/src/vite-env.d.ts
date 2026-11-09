/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_CENTER_LAT?: string;
  readonly VITE_MAP_CENTER_LNG?: string;
  readonly VITE_MAP_ZOOM?: string;
  readonly VITE_MAP_PITCH?: string;
  readonly VITE_MAP_BEARING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
