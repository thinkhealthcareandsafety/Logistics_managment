import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ShipmentDetail } from './pages/ShipmentDetail';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { PublicTracking } from './pages/PublicTracking';
import { Profile } from './pages/Profile';
import { Landing } from './pages/Landing';
import { Feedback } from './pages/Feedback';
import { Stock } from './pages/Stock';
import { PublicStock } from './pages/PublicStock';

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** "/" is the public marketing page for visitors and a shortcut to the dashboard once signed in. */
function Home() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  return (
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
  );
}
