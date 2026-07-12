import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

/*
 * Workspace / account context for flat teams. Every signed-in user has their
 * own account, plus any accounts they are an active teammate of. `accountId`
 * is the account whose data the dashboard reads; it defaults to your own and
 * is switchable from the top bar.
 */
const AccountContext = createContext(null);
const KEY = 'manishapay_account';

export function AccountProvider({ children }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountIdState] = useState(null);

  useEffect(() => {
    if (!user) { setAccounts([]); setAccountIdState(null); return; }
    let cancel = false;
    (async () => {
      const list = [{ id: user.id, label: 'My account', isOwn: true }];
      const { data: memberships } = await supabase
        .from('manishapay_team_members')
        .select('owner_id')
        .eq('member_id', user.id)
        .eq('status', 'active');
      const ownerIds = (memberships || []).map((m) => m.owner_id);
      if (ownerIds.length) {
        const { data: owners } = await supabase
          .from('manishapay_developers')
          .select('id, email, full_name')
          .in('id', ownerIds);
        (owners || []).forEach((o) => list.push({ id: o.id, label: o.full_name || o.email || 'Team account', isOwn: false }));
      }
      if (cancel) return;
      setAccounts(list);
      const saved = localStorage.getItem(KEY);
      setAccountIdState(saved && list.some((a) => a.id === saved) ? saved : user.id);
    })();
    return () => { cancel = true; };
  }, [user]);

  const setAccountId = (id) => { localStorage.setItem(KEY, id); setAccountIdState(id); };

  return (
    <AccountContext.Provider value={{ accountId: accountId || user?.id || null, accounts, setAccountId }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext) || { accountId: null, accounts: [], setAccountId: () => {} };
}
