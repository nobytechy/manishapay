import { supabase } from './supabase';

/*
 * Best-effort admin-action audit. Writes one row to manishapay_admin_audit.
 * Deliberately never throws — auditing must not block or break the action it
 * records. If the audit table hasn't been provisioned yet (admin_audit.sql
 * not run), the insert simply returns an error we ignore.
 */
export async function logAdminAction(actor, action, target = {}, detail = null) {
  try {
    await supabase.from('manishapay_admin_audit').insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      action,
      target_id: target?.id ?? null,
      target_email: target?.email ?? null,
      detail,
    });
  } catch {
    /* best-effort — swallow */
  }
}
