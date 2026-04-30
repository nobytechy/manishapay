import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing — copy .env.example to .env');
}

export const supabase = createClient(url || 'http://localhost', anon || 'public-anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
