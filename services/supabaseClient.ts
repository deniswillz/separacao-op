import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('As credenciais do Supabase não foram encontradas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const upsertBatched = async (table: string, items: any[], batchSize = 500) => {
  // 1. De-duplicação local: Supabase falha no upsert se o lote tiver o mesmo conflito várias vezes
  const uniqueItems = Array.from(
    new Map(items.map(item => [item.documento || item.op || item.codigo || item.id, item])).values()
  );

  for (let i = 0; i < uniqueItems.length; i += batchSize) {
    const batch = uniqueItems.slice(i, i + batchSize);

    // Identificar o alvo de conflito correto
    let onConflict = 'id';
    if (table === 'enderecos' || table === 'blacklist') onConflict = 'codigo';
    if (table === 'historico') onConflict = 'documento'; // Ajustado de 'op' para 'documento'

    const { error } = await supabase
      .from(table)
      .upsert(batch, {
        onConflict,
        ignoreDuplicates: false
      });

    if (error) {
      console.error(`Erro no upsert na tabela ${table}:`, error);
      throw error;
    }
  }
};
