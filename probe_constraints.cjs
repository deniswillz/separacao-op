
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function probeConstraints() {
    const { data, error } = await supabase.rpc('get_table_info', { table_name: 'historico' });
    if (error) {
        // If RPC doesn't exist, try a direct query to information_schema
        const { data: constraints, error: constError } = await supabase
            .from('historico')
            .select('id')
            .limit(1);

        console.log('Fetching history sample to see columns...');
        const { data: sample } = await supabase.from('historico').select('*').limit(1);
        console.log('Sample data:', sample);

        console.log('Trying to identify unique constraints via upsert trial...');
        const trialData = { documento: 'TRIAL-123', nome: 'Trial', armazem: 'CHICOTE', itens: [] };
        const { error: upsertKeyError } = await supabase.from('historico').upsert(trialData, { onConflict: 'id' });
        console.log('Upsert on id error:', upsertKeyError);
    } else {
        console.log('Table info:', data);
    }
}

probeConstraints();
