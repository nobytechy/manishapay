import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

import Overview from './pages/developer/Dashboard';
import Projects from './pages/developer/Projects';
import ApiKeys from './pages/developer/ApiKeys';
import Credentials from './pages/developer/Credentials';
import Webhooks from './pages/developer/Webhooks';
import Transactions from './pages/developer/Transactions';
import Tools from './pages/developer/Tools';
import Docs from './pages/developer/Docs';
import Settings from './pages/developer/Settings';

import AdminDashboard from './pages/admin/Dashboard';
import AdminDevelopers from './pages/admin/Developers';
import AdminLogs from './pages/admin/Logs';
import AdminWebhooks from './pages/admin/Webhooks';
import AdminAnnouncements from './pages/admin/Announcements';

function Protected({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/app"
        element={
          <Protected>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="keys" element={<ApiKeys />} />
        <Route path="credentials" element={<Credentials />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="tools" element={<Tools />} />
        <Route path="docs" element={<Docs />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route
        path="/admin"
        element={
          <Protected adminOnly>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="developers" element={<AdminDevelopers />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="webhooks" element={<AdminWebhooks />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
