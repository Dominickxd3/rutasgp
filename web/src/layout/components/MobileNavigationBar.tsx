import { Button } from 'primereact/button';

interface Props { panelOpen: boolean; onOpenMenu: () => void; onTogglePanel: () => void }
export function MobileNavigationBar({ panelOpen, onOpenMenu, onTogglePanel }: Props) {
  return <header className="mobile-navigation-bar">
    <Button icon="pi pi-bars" text rounded aria-label="Abrir menú" onClick={onOpenMenu} />
    <strong>Grupo Pecuario</strong>
    <Button icon={panelOpen ? 'pi pi-map' : 'pi pi-list'} label={panelOpen ? 'Mapa' : 'Panel'}
      text size="small" aria-label={panelOpen ? 'Mostrar mapa' : 'Mostrar panel'} onClick={onTogglePanel} />
  </header>;
}
