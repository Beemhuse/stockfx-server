// Supabase wiring for user-account-service
// Uses server-side service role key. Ensure `SUPABASE_URL` and
// `SUPABASE_SERVICE_ROLE_KEY` are set in environment (see .env.example).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type UserRecord = {
  id: string;
  email: string;
  password?: string;
  [key: string]: any;
};

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// DEBUG
console.log('[sharedDb] SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : '<empty>');
console.log('[sharedDb] SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.substring(0, 30) + '...' : '<empty>');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Do not throw here so tests or static analysis can still run, but warn at runtime.
  // Consumers should ensure env vars are set in production.
  // eslint-disable-next-line no-console
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. sharedDb will be a no-op stub.');
}

const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function createAuthUser(email: string, password: string) {
  if (!supabase) return { id: 'stub-id', email };
  try {
    // server-side admin create
    // @ts-ignore - admin API exists on server-side client
    const res = await (supabase.auth as any).admin.createUser({ email, password });
    if (res.error) throw res.error;
    const user = res.user || res.data?.user;
    return { id: user?.id || user?.sub || 'unknown', email: user?.email || email };
  } catch (err) {
    throw err;
  }
}

export const dbUser = {
  async create(email: string, password: string): Promise<UserRecord> {
    const user = await createAuthUser(email, password);
    return { id: user.id, email: user.email } as UserRecord;
  },

  async findById(id: string): Promise<UserRecord | null> {
    if (!supabase) return null;
    try {
      // @ts-ignore
      const res = await (supabase.auth as any).admin.getUserById(id);
      if (res.error) throw res.error;
      const user = res.user || res.data?.user;
      return user ? { id: user.id, email: user.email } : null;
    } catch (err) {
      return null;
    }
  },

  async findByEmail(email: string): Promise<UserRecord | null> {
    if (!supabase) return null;
    try {
      // admin.listUsers may be used to search; fallback to `auth.admin.getUserByEmail` if available
      // @ts-ignore
      if ((supabase.auth as any).admin.getUserByEmail) {
        // @ts-ignore
        const res = await (supabase.auth as any).admin.getUserByEmail(email);
        if (res.error) throw res.error;
        const user = res.user || res.data?.user;
        return user ? { id: user.id, email: user.email } : null;
      }

      // Fallback: list users (may be paginated)
      // @ts-ignore
      const list = await (supabase.auth as any).admin.listUsers({ filter: `email=eq.${email}` });
      const user = list?.users?.[0];
      return user ? { id: user.id, email: user.email } : null;
    } catch (err) {
      return null;
    }
  },

  async update(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    if (!supabase) return { id, ...data } as UserRecord;
    try {
      // Update user metadata (server admin update)
      // @ts-ignore
      const res = await (supabase.auth as any).admin.updateUserById(id, { user_metadata: data });
      if (res.error) throw res.error;
      const user = res.user || res.data?.user;
      return { id: user?.id || id, email: user?.email, ...data } as UserRecord;
    } catch (err) {
      throw err;
    }
  },
};

export const dbUserAccount = {
  async create(userId: string, initialBalance = 0) {
    if (!supabase) return { id: `acct-${userId}`, userId, balance: initialBalance } as any;
    const { data, error } = await supabase.from('user_accounts').insert({ user_id: userId, balance: initialBalance }).select().single();
    if (error) throw error;
    return data;
  },
  async getByUserId(userId: string) {
    if (!supabase) return null;
    const { data } = await supabase.from('user_accounts').select().eq('user_id', userId).maybeSingle();
    return data;
  },
  async updateBalance(userId: string, balance: number) {
    if (!supabase) return null;
    const { data, error } = await supabase.from('user_accounts').update({ balance }).eq('user_id', userId).select().single();
    if (error) throw error;
    return data;
  },
};

export const dbTransaction = {
  async create(tx: any) {
    if (!supabase) return tx;
    const { data, error } = await supabase.from('transactions').insert(tx).select().single();
    if (error) throw error;
    return data;
  },
};

export const dbPortfolio = {
  async getByUserId(userId: string) {
    if (!supabase) return [];
    const { data } = await supabase.from('portfolios').select().eq('user_id', userId);
    return data || [];
  },
};

export const dbOtp = {
  async create(code: string, userId: string) {
    if (!supabase) return { id: 'otp-id', code, userId } as any;
    const { data, error } = await supabase.from('otps').insert({ code, user_id: userId }).select().single();
    if (error) throw error;
    return data;
  },
  async verify(code: string) {
    if (!supabase) return false;
    const { data } = await supabase.from('otps').select().eq('code', code).maybeSingle();
    return !!data;
  },
};

export const dbSession = {
  async create(userId: string) {
    if (!supabase) return { id: 'session-id', userId } as any;
    const { data, error } = await supabase.from('sessions').insert({ user_id: userId }).select().single();
    if (error) throw error;
    return data;
  },
  async findById(id: string) {
    if (!supabase) return null;
    const { data } = await supabase.from('sessions').select().eq('id', id).maybeSingle();
    return data || null;
  },
};

export default supabase;
