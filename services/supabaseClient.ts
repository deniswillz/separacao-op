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

    // Tentar Upsert. Se falhar por falta de constraint unique, tentamos Insert simples.
    try {
      const { error } = await supabase
        .from(table)
        .upsert(batch, {
          onConflict,
          ignoreDuplicates: false
        });

      if (error) {
        if (error.code === '42P10') { // No unique constraint matching
          console.warn(`Aviso: Tabela ${table} não possui constraint unique para '${onConflict}'. Tentando insert simples...`);
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

