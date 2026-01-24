import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('As credenciais do Supabase não foram encontradas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const upsertBatched = async (table: string, items: any[], batchSize = 500) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const rawBatch = items.slice(i, i + batchSize);
    const onConflict = table === 'enderecos' || table === 'blacklist' ? 'codigo' : table === 'historico' ? 'op' : 'id';

    // De-duplicate locally within the batch to avoid "ON CONFLICT command cannot affect row a second time"
    const uniqueMap = new Map();
    rawBatch.forEach(item => {
      const { id, ...rest } = item;
      uniqueMap.set(rest[onConflict] || id, rest);
    });

    const cleanBatch = Array.from(uniqueMap.values());

    const { error } = await supabase
      .from(table)
      .upsert(cleanBatch, { onConflict, ignoreDuplicates: false });

    if (error) throw error;
  }
};
