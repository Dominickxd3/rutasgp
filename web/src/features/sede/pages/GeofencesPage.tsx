import { GeofencePanel } from '../components/GeofencePanel';
import { useAppState } from '../../../context/AppStateContext';

export function GeofencesPage() {
  const {
    geofences,
    selectedGeofenceId,
    selectedGeofenceRecord,
    geofence,
    placingShape,
    units,
    unitsInsideGeofence,
    unitsInsideSede,
    geofenceArea,
    setSelectedGeofenceId,
    handleClearGeofence,
    handleGeofenceRadiusChange,
    handleStartGeofencePlacement,
    handleGeofenceAppearanceChange,
  } = useAppState();

  return (
    <GeofencePanel
      geofences={geofences}
      selectedGeofenceId={selectedGeofenceId}
      onSelectGeofenceId={setSelectedGeofenceId}
      onClearGeofence={handleClearGeofence}
      onGeofenceRadiusChange={handleGeofenceRadiusChange}
      onStartPlacement={handleStartGeofencePlacement}
      onApplyAppearance={handleGeofenceAppearanceChange}
      unitsInsideGeofence={unitsInsideGeofence}
      unitsInsideSede={unitsInsideSede}
      totalUnits={units.length}
      geofenceArea={geofenceArea}
      placingShape={placingShape}
      geofence={geofence}
      selectedGeofenceRecord={selectedGeofenceRecord}
    />
  );
}
