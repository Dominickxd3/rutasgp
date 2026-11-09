import { HistoryPanel } from '../components/HistoryPanel';
import { useAppState } from '../../../context/AppStateContext';

export function HistoryPage() {
  const { geofences, setHistory } = useAppState();

  return (
    <HistoryPanel onVisualization={setHistory} geofences={geofences} isTab />
  );
}
