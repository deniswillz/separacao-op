import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('As credenciais do Supabase não foram encontradas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const upsertBatched = async (table: string, items: any[], batchSize = 500) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const cleanBatch = batch.map(({ id, ...rest }) => rest);

    // Logic: for addresses and blacklist, conflict is on 'codigo'. Others use 'id'.
    const onConflict = table === 'enderecos' || table === 'blacklist' ? 'codigo' : 'id';

    const { error } = await supabase
      .from(table)
      .upsert(cleanBatch, { onConflict, ignoreDuplicates: false });

    if (error) throw error;
  }
};
