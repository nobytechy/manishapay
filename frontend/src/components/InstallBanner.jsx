import { useEffect, useRef, useState } from 'react';

/*
 * "Install ManishaPay" banner.
 *
 * © 2026 Noby Tebulo (https://nobie.netlify.app) — author of ManishaPay.
 *
 * Chromium/Edge/Android: captures the `beforeinstallprompt` event and shows a
 * themed banner with a real Install button that triggers the native prompt.
 * iOS Safari: no such event exists, so when we detect iOS + not-yet-installed
 * we show short "Add to Home Screen" instructions instead.
 *
 * Dismissals are remembered for 7 days so we never nag. The banner also hides
 * itself the moment the app is running standalone (already installed).
 */
const DISMISS_KEY = 'manishapay_pwa_dismissed_at';
const DISMISS_DAYS = 7;

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = window.navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
}

function recentlyDismissed() {
  const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export default function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide-in transition
  const [ios, setIos] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return undefined;

    const reveal = () => {
      setVisible(true);
      requestAnimationFrame(() => setShown(true));
    };

    const onBeforePrompt = (e) => {
      e.preventDefault();
      promptRef.current = e;
      reveal();
    };

    window.addEventListener('beforeinstallprompt', onBeforePrompt);

    const onInstalled = () => {
      setShown(false);
      setTimeout(() => setVisible(false), 250);
      promptRef.current = null;
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt — offer manual instructions.
    let iosTimer;
    if (isIOS()) {
      iosTimer = setTimeout(() => {
        setIos(true);
        reveal();
      }, 2500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforePrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShown(false);
    setTimeout(() => setVisible(false), 250);
  };

  const install = async () => {
    const evt = promptRef.current;
    if (!evt) return;
    evt.prompt();
    try {
      await evt.userChoice;
    } finally {
      promptRef.current = null;
      setShown(false);
      setTimeout(() => setVisible(false), 250);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-3 sm:px-4 sm:pb-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-label="Install ManishaPay"
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-2xl border border-brand-500/25 bg-slate-900/95 shadow-2xl shadow-brand-950/40 ring-1 ring-black/40 backdrop-blur transition-all duration-300 ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <img
            src="/icons/icon-192.png"
            alt="ManishaPay"
            className="h-12 w-12 flex-none rounded-xl shadow-lg shadow-brand-900/40"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">Install ManishaPay</p>
            {ios ? (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Tap the <span className="font-semibold text-slate-200">Share</span> icon{' '}
                <IosShareIcon /> below, then choose{' '}
                <span className="font-semibold text-slate-200">“Add to Home Screen”</span>.
              </p>
            ) : (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Add it to your home screen for one-tap access — fast, full-screen and offline-ready.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex-none rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          >
            <CloseIcon />
          </button>
        </div>

        {!ios && (
          <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-3">
            <button
              type="button"
              onClick={install}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-brand-900/30 transition hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <DownloadIcon />
              Install app
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IosShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline align-text-bottom text-sky-400" aria-hidden="true">
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
