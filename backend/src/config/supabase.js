/**
 * Supabase client singleton.
 *
 * Uses the SERVICE ROLE key — never expose this client to the browser.
 * The frontend uses the anon key via @supabase/supabase-js directly.
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application': 'manishapay-gateway' } },
});

module.exports = { supabase };
