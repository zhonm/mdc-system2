import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://baowlgyhkokxxmukvafh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8OIOWK9FsffO8b4uG8q36Q_gNezmdaB';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('parts').select('count', { count: 'exact', head: true });
    if (error) throw error;
    return { connected: true, message: 'Connected to Supabase PostgreSQL' };
  } catch (err) {
    return { connected: false, message: err.message || 'Running in local/offline storage mode' };
  }
};
