import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';
import { env } from '../config/env.js';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
