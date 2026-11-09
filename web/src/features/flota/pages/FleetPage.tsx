import { FleetPanel } from '../components/FleetPanel';
import { useAppState } from '../../../context/AppStateContext';

export function FleetPage() {
  const { units, isRefreshing, hasLoaded, focusUnit, selectedUnit, refresh } =
    useAppState();

  return (
    <FleetPanel
      units={units}
      loading={isRefreshing && !hasLoaded}
      onFocus={focusUnit}
      selectedUnitId={selectedUnit?.idUnidad}
      onRefresh={refresh}
    />
  );
}
