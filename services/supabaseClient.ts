import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('As credenciais do Supabase não foram encontradas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const upsertBatched = async (table: string, items: any[], batchSize = 900) => {

  // 1. De-duplicação local: Supabase falha no upsert se o lote tiver o mesmo conflito várias vezes
  const uniqueItems = Array.from(
    new Map(items.map(item => [item.documento || item.op || item.codigo || item.id, item])).values()
  );

  for (let i = 0; i < uniqueItems.length; i += batchSize) {
    const batch = uniqueItems.slice(i, i + batchSize);

    // Identificar o alvo de conflito correto
    let onConflict = 'id';
    if (table === 'enderecos' || table === 'blacklist') onConflict = 'codigo';
    // Historico often lacks unique index on documento in legacy schemas, so we stick to 'id' or explicit upsert logic elsewhere.
    // if (table === 'historico') onConflict = 'documento'; 

    // Tentar Upsert.
    try {
      const { error } = await supabase
        .from(table)
        .upsert(batch, {
          onConflict,
          ignoreDuplicates: false
        });

      if (error) {
        console.warn(`Erro no upsert na tabela ${table} (${onConflict}):`, error.message);
        // Se falhar por falta de constraint unique, tentamos insert simples.
        // O erro 42P10 é 'no unique constraint matching given keys for upsert'
        if (error.code === '42P10' || error.message?.includes('unique constraint') || error.code === 'PGRST202') {
          console.warn(`Tentando insert simples na tabela ${table}...`);
          const { error: insError } = await supabase.from(table).insert(batch);
          if (insError) throw insError;
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`Erro crítico no upsert/insert na tabela ${table}:`, error);
      throw error;
    }
  }
};
