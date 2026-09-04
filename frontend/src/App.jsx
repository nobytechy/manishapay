import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';

/*
 * Route-level code splitting.
 *
 * Everything used to ship in one 805 KB bundle: a merchant on a Samsung over
 * Zimbabwean mobile data downloaded the 960-line Sandbox, the docs, the forum
 * archive and the whole admin console before the login screen could paint.
 *
 * Only the two entry points a first-time visitor actually sees are eager.
 * Every other route is fetched on navigation — small enough to arrive during
 * the tap, and cached from then on.
 */
import { lazy, Suspense } from 'react';

/**
 * Split routes have one failure mode worth handling: after a deploy, a browser
 * still holding the previous index.html asks for a chunk whose hashed filename
 * no longer exists. The dynamic import rejects and the route renders nothing —
 * a blank screen, on the tap that should have worked.
 *
 * One retry covers a flaky network. If it fails again the page really is stale,
 * so reload to pick up the new index.html. The sessionStorage guard means a
 * genuinely broken deploy shows an error instead of reloading forever.
 */
const RELOAD_GUARD = 'mp_chunk_reload';
function lazyRoute(loader) {
  return lazy(() =>
    loader()
      .then((mod) => {
        sessionStorage.removeItem(RELOAD_GUARD);
        return mod;
      })
      .catch(async (err) => {
        try {
          return await loader();
        } catch {
          if (!sessionStorage.getItem(RELOAD_GUARD)) {
            sessionStorage.setItem(RELOAD_GUARD, '1');
            window.location.reload();
            // Never resolves — the reload takes over.
            return new Promise(() => {});
          }
          throw err;
        }
      })
  );
}

// Eager: the front door and the sign-in screen. Splitting these would only
// add a round trip to the very first paint.
import Landing from './pages/Landing';
import Login from './pages/Login';

const AdminLogin = lazyRoute(() => import('./pages/AdminLogin'));
const Register = lazyRoute(() => import('./pages/Register'));
const ForgotPassword = lazyRoute(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyRoute(() => import('./pages/ResetPassword'));
const GetStarted = lazyRoute(() => import('./pages/GetStarted'));
const DocsHome = lazyRoute(() => import('./pages/DocsHome'));
const ForumCoverage = lazyRoute(() => import('./pages/ForumCoverage'));
const AiAssistant = lazyRoute(() => import('./pages/AiAssistant'));
const PayLink = lazyRoute(() => import('./pages/PayLink'));
const Status = lazyRoute(() => import('./pages/Status'));

const Overview = lazyRoute(() => import('./pages/developer/Dashboard'));
const Connect = lazyRoute(() => import('./pages/developer/Connect'));
const PaymentLinks = lazyRoute(() => import('./pages/developer/PaymentLinks'));
const Health = lazyRoute(() => import('./pages/developer/Health'));
const Billing = lazyRoute(() => import('./pages/developer/Billing'));
const Subscriptions = lazyRoute(() => import('./pages/developer/Subscriptions'));
const Team = lazyRoute(() => import('./pages/developer/Team'));
const Fiscalise = lazyRoute(() => import('./pages/developer/Fiscalise'));
const Projects = lazyRoute(() => import('./pages/developer/Projects'));
const ApiKeys = lazyRoute(() => import('./pages/developer/ApiKeys'));
const PaymentMethods = lazyRoute(() => import('./pages/developer/PaymentMethods'));
const Webhooks = lazyRoute(() => import('./pages/developer/Webhooks'));
const Transactions = lazyRoute(() => import('./pages/developer/Transactions'));
const Tools = lazyRoute(() => import('./pages/developer/Tools'));
const Sandbox = lazyRoute(() => import('./pages/developer/Sandbox'));
const Docs = lazyRoute(() => import('./pages/developer/Docs'));
const Support = lazyRoute(() => import('./pages/developer/Support'));
const Settings = lazyRoute(() => import('./pages/developer/Settings'));

const AdminDashboard = lazyRoute(() => import('./pages/admin/Dashboard'));
const AdminDevelopers = lazyRoute(() => import('./pages/admin/Developers'));
const AdminAudit = lazyRoute(() => import('./pages/admin/Audit'));
const AdminSupport = lazyRoute(() => import('./pages/admin/Support'));
const AdminSettings = lazyRoute(() => import('./pages/admin/Settings'));
const AdminLogs = lazyRoute(() => import('./pages/admin/Logs'));
const AdminWebhooks = lazyRoute(() => import('./pages/admin/Webhooks'));
const AdminAnnouncements = lazyRoute(() => import('./pages/admin/Announcements'));

/*
 * Route chunks land in a few hundred milliseconds, so a spinner would flash
 * and draw the eye for no reason. A quiet placeholder holds the space instead.
 */
function RouteFallback() {
  return <div className="min-h-[40vh]" aria-busy="true" />;
}

function WaitingScreen() {
  // If connecting drags past 8s, stop pretending: offer a way out instead
  // of an eternal spinner (the old behaviour when a session read stalled).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        {slow && (
          <div className="text-center text-sm text-slate-400">
            <p>Still connecting…</p>
            <p className="mt-2 flex gap-4">
              <button onClick={() => window.location.reload()} className="underline underline-offset-4 hover:text-slate-200">Reload</button>
              <a href="/login" className="underline underline-offset-4 hover:text-slate-200">Go to sign in</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Protected({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading, profileReady } = useAuth();
  // Spinner only while the SESSION is unknown, or (for admin routes) while the
  // profile that decides admin access is still loading. Regular /app pages render
  // as soon as the session is known — no waiting on a profile round-trip.
  const waiting = loading || (adminOnly && isAuthenticated && !profileReady);
  if (waiting) return <WaitingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/get-started" element={<GetStarted />} />
      <Route path="/docs" element={<DocsHome />} />
      <Route path="/forum-coverage" element={<ForumCoverage />} />
      <Route path="/ai" element={<AiAssistant />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pay/:slug" element={<PayLink />} />
      <Route path="/status" element={<Status />} />

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
        <Route path="methods" element={<PaymentMethods />} />
        {/* Old split screens — both jobs now live on one page. */}
        <Route path="gateways" element={<Navigate to="/app/methods" replace />} />
        <Route path="credentials" element={<Navigate to="/app/methods" replace />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="health" element={<Health />} />
        <Route path="billing" element={<Billing />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="team" element={<Team />} />
        <Route path="fiscalise" element={<Fiscalise />} />
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
    </Suspense>
  );
}
