import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { AppStateProvider } from './context/AppStateContext';
import { AppLayout } from './layout/AppLayout';
import { FleetPage } from './features/flota/pages/FleetPage';
import { TripsPage } from './features/recorridos/pages/TripsPage';
import { HistoryPage } from './features/historial/pages/HistoryPage';
import { GeofencesPage } from './features/sede/pages/GeofencesPage';
import { OrdersPage } from './features/pedidos/pages/OrdersPage';
import { OrderAssignmentPage } from './features/asignacion-pedidos/pages/OrderAssignmentPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={<Navigate to="/monitoreo/flota" replace />}
            />
            <Route path="monitoreo">
              <Route
                index
                element={<Navigate to="/monitoreo/flota" replace />}
              />
              <Route path="flota" element={<FleetPage />} />
              <Route path="recorridos" element={<TripsPage />} />
              <Route path="historial" element={<HistoryPage />} />
              <Route path="geocercas" element={<GeofencesPage />} />
            </Route>
            <Route path="distribucion">
              <Route
                index
                element={<Navigate to="/distribucion/pedidos" replace />}
              />
              <Route path="pedidos" element={<OrdersPage />} />
              <Route
                path="asignacion"
                element={<OrderAssignmentPage />}
              />
            </Route>
            <Route
              path="*"
              element={<Navigate to="/monitoreo/flota" replace />}
            />
          </Route>
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  );
}
