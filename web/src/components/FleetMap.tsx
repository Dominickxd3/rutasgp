import L from 'leaflet';
import 'leaflet.markercluster';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import {
  escapeHtml,
  formatNumber,
  formatUnitDate,
} from '../lib/format';
import type { FleetUnit } from '../types/fleet';

export interface FleetMapHandle {
  focusUnit: (unit: FleetUnit) => void;
  fitAll: () => void;
}

interface FleetMapProps {
  units: FleetUnit[];
  onSelect?: (unit: FleetUnit) => void;
}

const INITIAL_CENTER: L.LatLngExpression = [-11.98, -77.01];
const INITIAL_ZOOM = 12;

const CAR_PLATES = new Set(['CNK842', 'CWN696', 'BLH779']);

type VehicleKind = 'car' | 'truck';

function vehicleKind(unit: FleetUnit): VehicleKind {
  const normalizedPlate = unit.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

  return CAR_PLATES.has(normalizedPlate) ? 'car' : 'truck';
}

function unitTitle(unit: FleetUnit): string {
  return unit.cliente ? `${unit.placa} · ${unit.cliente}` : unit.placa;
}

function unitTooltip(unit: FleetUnit): string {
  const client = unit.cliente
    ? ` · ${escapeHtml(unit.cliente)}`
    : '';

  return `<strong>${escapeHtml(unit.placa)}</strong>${client}`;
}

function iconSignature(unit: FleetUnit): string {
  return [
    vehicleKind(unit),
    unit.motorEncendido ? 'on' : 'off',
    unit.velocidad > 0 ? 'moving' : 'idle',
  ].join('|');
}

function buildMarkerIcon(unit: FleetUnit): L.DivIcon {
  const moving = unit.velocidad > 0;
  const state = unit.motorEncendido ? 'on' : 'off';
  const kind = vehicleKind(unit);
  const vehicleImage = kind === 'car' ? '/vehicles/car.png' : '/vehicles/truck.png';

  return L.divIcon({
    className: `unit-marker unit-marker--${kind}${moving ? ' unit-marker--moving' : ''}`,
    html: `
      <span class="unit-marker__pulse" aria-hidden="true"></span>
      <span class="unit-marker__body unit-marker__body--${state}">
        <img class="unit-marker__image" src="${vehicleImage}" alt="" aria-hidden="true" />
      </span>
      <span class="unit-marker__label unit-marker__label--${state}">${escapeHtml(unit.placa)}</span>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  });
}

function buildPopupHtml(unit: FleetUnit): string {
  const statusClass = unit.motorEncendido ? 'is-on' : 'is-off';
  const battery =
    unit.bateria === null ? '—' : `${formatNumber(unit.bateria)} V`;
  const mileage =
    unit.kilometraje === null
      ? '—'
      : `${formatNumber(unit.kilometraje, 0)} km`;
  const client = unit.cliente
    ? `<p class="unit-popup__client">${escapeHtml(unit.cliente)}</p>`
    : '';

  return `
    <article class="unit-popup">
      <header class="unit-popup__head">
        <span class="unit-popup__plate">${escapeHtml(unit.placa)}</span>
        <span class="unit-popup__status ${statusClass}">${escapeHtml(unit.estadoMotor)}</span>
      </header>
      ${client}
      <dl class="unit-popup__grid">
        <div><dt>Velocidad</dt><dd>${unit.velocidad} km/h</dd></div>
        <div><dt>Batería</dt><dd>${battery}</dd></div>
        <div><dt>Kilometraje</dt><dd>${mileage}</dd></div>
        <div><dt>Última señal</dt><dd>${escapeHtml(formatUnitDate(unit.fecha))}</dd></div>
      </dl>
      <footer class="unit-popup__footer">
        <span>${unit.latitud.toFixed(5)}, ${unit.longitud.toFixed(5)}</span>
        <span>ID ${escapeHtml(unit.idUnidad)}</span>
      </footer>
    </article>
  `;
}

function fitUnits(map: L.Map, units: FleetUnit[]): void {
  if (units.length === 0) {
    return;
  }

  const bounds = L.latLngBounds(
    units.map((unit) => [unit.latitud, unit.longitud] as [number, number]),
  );

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
  }
}

export const FleetMap = forwardRef<FleetMapHandle, FleetMapProps>(
  function FleetMap({ units, onSelect }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
    const markersRef = useRef(new Map<string, L.Marker>());
    const signaturesRef = useRef(new Map<string, string>());
    const hasFittedRef = useRef(false);
    const focusTimerRef = useRef<number | null>(null);
    const unitsRef = useRef(units);
    const onSelectRef = useRef(onSelect);

    unitsRef.current = units;

    useEffect(() => {
      onSelectRef.current = onSelect;
    }, [onSelect]);

    useEffect(() => {
      const container = containerRef.current;

      if (!container || mapRef.current) {
        return;
      }

      const map = L.map(container, {
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        zoomControl: false,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

      const clusters = L.markerClusterGroup({
        maxClusterRadius: 52,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.6,
        removeOutsideVisibleBounds: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();

          return L.divIcon({
            className: 'fleet-cluster',
            html: `
              <span class="fleet-cluster__vehicle">
                <img src="/vehicles/truck.png" alt="" aria-hidden="true" />
              </span>
              <strong class="fleet-cluster__count" aria-label="${count} unidades">${count}</strong>
            `,
            iconSize: [58, 42],
            iconAnchor: [29, 21],
          });
        },
      }).addTo(map);

      mapRef.current = map;
      clusterRef.current = clusters;

      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });

      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();

        if (focusTimerRef.current !== null) {
          window.clearTimeout(focusTimerRef.current);
          focusTimerRef.current = null;
        }

        map.remove();
        mapRef.current = null;
        clusterRef.current = null;
        markersRef.current.clear();
        signaturesRef.current.clear();
        hasFittedRef.current = false;
      };
    }, []);

    useEffect(() => {
      const map = mapRef.current;
      const clusters = clusterRef.current;

      if (!map || !clusters) {
        return;
      }

      const seen = new Set<string>();

      if (units.length === 0) {
        hasFittedRef.current = false;
      }

      units.forEach((unit) => {
        seen.add(unit.idUnidad);

        const position = L.latLng(unit.latitud, unit.longitud);
        const signature = iconSignature(unit);
        let marker = markersRef.current.get(unit.idUnidad);

        if (marker) {
          marker.setLatLng(position);
          marker.setZIndexOffset(unit.velocidad > 0 ? 500 : 0);

          if (signaturesRef.current.get(unit.idUnidad) !== signature) {
            marker.setIcon(buildMarkerIcon(unit));
            signaturesRef.current.set(unit.idUnidad, signature);
          }

          marker.getPopup()?.setContent(buildPopupHtml(unit));
          marker.setTooltipContent(unitTooltip(unit));
        } else {
          marker = L.marker(position, {
            icon: buildMarkerIcon(unit),
            title: unitTitle(unit),
            riseOnHover: true,
          }).bindPopup(buildPopupHtml(unit), {
              className: 'fleet-popup',
              maxWidth: 300,
              autoPanPadding: [28, 28],
            })
            .bindTooltip(unitTooltip(unit), {
              direction: 'top',
              offset: [0, -18],
              opacity: 1,
            });

          clusters.addLayer(marker);

          marker.setZIndexOffset(unit.velocidad > 0 ? 500 : 0);

          marker.on('click', () => {
            const selectedId = unit.idUnidad;
            const selectedUnit =
              unitsRef.current.find((item) => item.idUnidad === selectedId) ??
              unit;

            onSelectRef.current?.(selectedUnit);
          });

          markersRef.current.set(unit.idUnidad, marker);
          signaturesRef.current.set(unit.idUnidad, signature);
        }
      });

      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          clusters.removeLayer(marker);
          markersRef.current.delete(id);
          signaturesRef.current.delete(id);
        }
      });

      if (!hasFittedRef.current && units.length > 0) {
        hasFittedRef.current = true;
        fitUnits(map, units);
      }


      clusters.refreshClusters();
    }, [units]);

    const focusUnit = useCallback((unit: FleetUnit): void => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.flyTo(
        [unit.latitud, unit.longitud],
        Math.max(map.getZoom(), 15),
        { duration: 0.8 },
      );

      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
      }

      focusTimerRef.current = window.setTimeout(() => {
        const marker = markersRef.current.get(unit.idUnidad);
        const clusters = clusterRef.current;

        marker?.setZIndexOffset(2_000);

        if (marker && clusters) {
          clusters.zoomToShowLayer(marker, () => marker.openPopup());
        }

        focusTimerRef.current = null;
      }, 600);
    }, []);

    const fitAll = useCallback((): void => {
      const map = mapRef.current;

      if (map) {
        fitUnits(map, unitsRef.current);
      }
    }, []);

    useImperativeHandle(ref, () => ({ focusUnit, fitAll }), [
      focusUnit,
      fitAll,
    ]);

    return (
      <div
        className="fleet-map"
        ref={containerRef}
        aria-label="Mapa de posiciones de la flota"
      />
    );
  },
);
