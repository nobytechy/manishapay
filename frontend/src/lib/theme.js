// Shared light/dark theme. Dark is the default; light is opt-in and persisted.
// An inline script in index.html applies the stored choice before first paint,
// so there's no flash of the wrong theme on load.
const KEY = 'manishapay_theme';

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme !== 'light');
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked — still apply */ }
  applyTheme(theme);
}
