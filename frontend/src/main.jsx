import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AccountProvider } from './context/AccountContext';
import InstallBanner from './components/InstallBanner';
import './index.css';

/*
 * Wake the backend the moment the page loads.
 *
 * The API sleeps on Render's free tier, so the first request after idle pays a
 * cold start. That request used to be the merchant's — they'd tap "sign in" and
 * wait on a machine that was still booting. Pinging /health while they're still
 * reading the landing page moves that wait somewhere they don't feel it.
 *
 * Deliberately fire-and-forget and deliberately after `load`, so it never
 * competes with rendering or delays anything the user is waiting on.
 */
const API_BASE = import.meta.env.VITE_API_BASE;
if (API_BASE) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      fetch(`${API_BASE}/health`, { method: 'GET', mode: 'cors', cache: 'no-store' }).catch(() => {});
    }, 0);
  });
}

// Register the PWA service worker (installability + offline shell).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: the app works fine without the SW; it just isn't installable.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
        <App />
        <InstallBanner />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
            success: { iconTheme: { primary: '#10b981', secondary: '#0b1220' } },
            error: { iconTheme: { primary: '#e43d5e', secondary: '#0b1220' } },
          }}
        />
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
