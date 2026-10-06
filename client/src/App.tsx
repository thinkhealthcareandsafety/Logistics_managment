import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui/Loading';
import { Login } from './pages/Login';

// Each page is its own download, fetched the first time it's opened - the landing
// page doesn't ship the dashboard, and staff don't download the marketing site.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const Landing = page(() => import('./pages/Landing'), 'Landing');
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard');
const ShipmentDetail = page(() => import('./pages/ShipmentDetail'), 'ShipmentDetail');
const Settings = page(() => import('./pages/Settings'), 'Settings');
const Analytics = page(() => import('./pages/Analytics'), 'Analytics');
const PublicTracking = page(() => import('./pages/PublicTracking'), 'PublicTracking');
const Profile = page(() => import('./pages/Profile'), 'Profile');
const Feedback = page(() => import('./pages/Feedback'), 'Feedback');
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
        {/* Secret-link stock view pinned in the logistics WhatsApp group */}
        <Route path="/stock/live/:token" element={<PublicStock />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/shipments/:id" element={<ShipmentDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
