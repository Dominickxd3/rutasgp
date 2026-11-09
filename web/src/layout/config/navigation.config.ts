import type { NavSection, NavigationCounts } from '../types/navigation.types';

export function createNavigation(
  counts: NavigationCounts,
  onOpenKpis?: () => void,
): NavSection[] {
  return [
    {
      key: 'monitoreo',
      label: 'Monitoreo GPS',
      icon: 'pi pi-map',
      items: [
        {
          path: '/monitoreo/flota',
          label: 'Monitoreo en vivo',
          icon: 'pi pi-compass',
        },
        {
          path: '/monitoreo/historial',
          label: 'Historial',
          icon: 'pi pi-clock',
        },
        {
          key: 'kpis',
          path: '#kpis',
          label: 'Indicadores (KPIs)',
          icon: 'pi pi-chart-bar',
          onClick: onOpenKpis,
        },
      ],
    },
    {
      key: 'distribucion',
      label: 'Distribución',
      icon: 'pi pi-truck',
      items: [
        {
          path: '/distribucion/pedidos',
          label: 'Pedidos',
          icon: 'pi pi-shopping-cart',
        },
        {
          path: '/distribucion/asignacion',
          label: 'Asignación de pedidos',
          icon: 'pi pi-list-check',
        },
      ],
    },
    {
      key: 'herramientas', label: 'Herramientas', icon: 'pi pi-sliders-h', collapsible: true,
      items: [
        { path: '/monitoreo/geocercas', label: 'Geocercas', icon: 'pi pi-map-marker' },
        { path: '/monitoreo/recorridos', label: 'Rutas y recorridos', icon: 'pi pi-directions',
          badge: counts.activeTrips || undefined },
      ],
    },
  ];
}
