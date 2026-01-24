import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pzzaqabdjhczpeffmrrv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6emFxYWJkamhjenBlZmZtcnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzE5NDYsImV4cCI6MjA4Mzc0Nzk0Nn0.qMOkm718pCU0LgktrENyx4RutLzaGWexY9Z9dLqcsU8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
    const tables = ['enderecos', 'blacklist', 'historico', 'separacao'];
    for (const table of tables) {
        console.log(`--- Table: ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            console.log('Table is empty, trying to fetch schema via RPC or info schema...');
            // Fallback: try to see if we can get anything from a failed select with a wrong column
            const { error: schemaError } = await supabase.from(table).select('non_existent_column');
            console.log('Schema hint from error:', schemaError?.message);
        }
    }
}

probe();
