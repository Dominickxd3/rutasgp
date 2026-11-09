import { DailyTripsPanel } from '../components/DailyTripsPanel';
import { useAppState } from '../../../context/AppStateContext';

export function TripsPage() {
  const { setHistory, setActiveTripsCount, setSelectedTrip, selectedTrip } =
    useAppState();

  return (
    <DailyTripsPanel
      liveEnabled
      onVisualization={setHistory}
      onActiveCountChange={setActiveTripsCount}
      onTripSelected={setSelectedTrip}
      selectedTrip={selectedTrip}
      isTab
    />
  );
}
