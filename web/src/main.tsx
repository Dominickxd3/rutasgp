import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';

import 'primereact/resources/themes/lara-light-blue/theme.css';
import 'primeicons/primeicons.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './styles/main.scss';

import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento #root para montar la aplicación.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PrimeReactProvider value={{ ripple: true }}>
      <App />
    </PrimeReactProvider>
  </React.StrictMode>,
);
