import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui/Loading';
import { Login } from './pages/Login';
import { StockLedgerProvider } from './context/StockLedger';

// Each page is its own download, fetched the first time it's opened - the landing
// page doesn't ship the dashboard, and staff don't download the marketing site.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const Landing = page(() => import('./pages/Landing'), 'Landing');
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard');
const ShipmentDetail = page(() => import('./pages/ShipmentDetail'), 'ShipmentDetail');
const Settings = page(() => import('./pages/Settings'), 'Settings');
const Analytics = page(() => import('./pages/Analytics'), 'Analytics');
const Couriers = page(() => import('./pages/Couriers'), 'Couriers');
const PublicTracking = page(() => import('./pages/PublicTracking'), 'PublicTracking');
const Profile = page(() => import('./pages/Profile'), 'Profile');
const Feedback = page(() => import('./pages/Feedback'), 'Feedback');
const ReceiveDelivery = page(() => import('./pages/ReceiveDelivery'), 'ReceiveDelivery');
const DeliverySlip = page(() => import('./pages/DeliverySlip'), 'DeliverySlip');
const Stock = page(() => import('./pages/Stock'), 'Stock');
const PublicStock = page(() => import('./pages/PublicStock'), 'PublicStock');

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** "/" is the public marketing page for visitors and a shortcut to the dashboard once signed in. */
function Home() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  return (
    // Public pages load full-screen; signed-in pages show their skeleton inside the
    // layout (see Layout), so the navigation never disappears between pages.
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        {/* Public, no-login pages - the tracking number itself is the access token */}
        <Route path="/track/:trackingNumber" element={<PublicTracking />} />
        <Route path="/feedback/:trackingNumber" element={<Feedback />} />
        {/* Delivery receipt - the secret token from the slip's QR / shared link; no sign-in */}
        <Route path="/receive/:token" element={<ReceiveDelivery />} />
        {/* Printable slip for the box - signed in, but outside the app layout so it prints clean */}
        <Route
          path="/shipments/:id/slip"
          element={
            <ProtectedRoute>
              <DeliverySlip />
            </ProtectedRoute>
          }
        />
        {/* Secret-link stock view pinned in the logistics WhatsApp group */}
        <Route path="/stock/live/:token" element={<PublicStock />} />
        <Route
          path="/manual-stock/live/:token"
          element={
            <StockLedgerProvider kind="manual">
              <PublicStock />
            </StockLedgerProvider>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/couriers" element={<Couriers />} />
          <Route path="/stock" element={<Stock key="zoho" />} />
          {/* Kept by hand, not connected to Zoho Books - same page on its own collections. */}
          <Route
            path="/manual-stock"
            element={
              <StockLedgerProvider kind="manual">
                <Stock key="manual" />
              </StockLedgerProvider>
            }
          />
          <Route path="/shipments/:id" element={<ShipmentDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
