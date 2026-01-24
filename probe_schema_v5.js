import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pzzaqabdjhczpeffmrrv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6emFxYWJkamhjenBlZmZtcnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzE5NDYsImV4cCI6MjA4Mzc0Nzk0Nn0.qMOkm718pCU0LgktrENyx4RutLzaGWexY9Z9dLqcsU8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
    const schemaMap = {
        enderecos: ['armazem', 'codigo', 'descricao', 'endereco', 'unidade', 'id', 'created_at'],
        blacklist: ['codigo', 'naoSep', 'talvez', 'dataInclusao', 'id', 'created_at', 'nao_sep', 'data_inclusao'],
        separacao: ['id', 'status', 'usuario_atual', 'data_criacao', 'documento', 'armazem', 'ordens', 'itens', 'urgencia', 'created_at'],
        historico: ['id', 'nome', 'armazem', 'ordens', 'responsavel_separacao', 'responsavel_conferencia', 'data_finalizacao', 'itens', 'data_conferencia', 'documento', 'total_itens', 'itens_o_k', 'created_at', 'data']
    };

    for (const [table, cols] of Object.entries(schemaMap)) {
        console.log(`\n--- TABLE: ${table} ---`);
        for (const col of cols) {
            const { error } = await supabase.from(table).select(col).limit(1);
            if (!error) {
                console.log(`[OK] ${col}`);
            } else {
                console.log(`[ERR] ${col}: ${error.message}`);
            }
        }
    }
}

probe();
