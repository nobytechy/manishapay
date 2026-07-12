import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import GetStarted from './pages/GetStarted';
import DocsHome from './pages/DocsHome';
import ForumCoverage from './pages/ForumCoverage';

import Overview from './pages/developer/Dashboard';
import Connect from './pages/developer/Connect';
import PaymentLinks from './pages/developer/PaymentLinks';
import PayLink from './pages/PayLink';
import Projects from './pages/developer/Projects';
import ApiKeys from './pages/developer/ApiKeys';
import Credentials from './pages/developer/Credentials';
import Webhooks from './pages/developer/Webhooks';
import Transactions from './pages/developer/Transactions';
import Tools from './pages/developer/Tools';
import Sandbox from './pages/developer/Sandbox';
import Docs from './pages/developer/Docs';
import Support from './pages/developer/Support';
import Settings from './pages/developer/Settings';

import AdminDashboard from './pages/admin/Dashboard';
import AdminDevelopers from './pages/admin/Developers';
import AdminAudit from './pages/admin/Audit';
import AdminSupport from './pages/admin/Support';
import AdminSettings from './pages/admin/Settings';
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
      <Route path="/get-started" element={<GetStarted />} />
      <Route path="/docs" element={<DocsHome />} />
      <Route path="/forum-coverage" element={<ForumCoverage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pay/:slug" element={<PayLink />} />

      <Route
        path="/app"
        element={
          <Protected>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route path="connect" element={<Connect />} />
        <Route path="links" element={<PaymentLinks />} />
        <Route path="projects" element={<Projects />} />
        <Route path="keys" element={<ApiKeys />} />
        <Route path="credentials" element={<Credentials />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="sandbox" element={<Sandbox />} />
        <Route path="tools" element={<Tools />} />
        <Route path="docs" element={<Docs />} />
        <Route path="support" element={<Support />} />
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
        <Route path="audit" element={<AdminAudit />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="webhooks" element={<AdminWebhooks />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
