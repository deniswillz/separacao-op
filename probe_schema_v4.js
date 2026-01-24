import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pzzaqabdjhczpeffmrrv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6emFxYWJkamhjenBlZmZtcnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzE5NDYsImV4cCI6MjA4Mzc0Nzk0Nn0.qMOkm718pCU0LgktrENyx4RutLzaGWexY9Z9dLqcsU8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
    const tables = ['enderecos', 'blacklist', 'separacao', 'usuarios'];
    for (const table of tables) {
        console.log(`--- Investigating ${table} ---`);
        // Try to get column information by selecting a non-existent column
        // The error message often lists valid columns in some DBs, or we can try to guess.
        const { error } = await supabase.from(table).select('non_existent_column');
        if (error && error.message) {
            console.log(`Hint from missing column: ${error.message}`);
        }

        // Try a broad select to see if we can get at least one row if user added something
        const { data } = await supabase.from(table).select('*').limit(1);
        if (data && data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            // Try to trigger a 400 with a likely correct column to confirm it exists
            const commonColumns = ['codigo', 'status', 'armazem', 'created_at', 'id', 'data_inclusao', 'data_criacao'];
            for (const col of commonColumns) {
                const { error: colError } = await supabase.from(table).select(col).limit(1);
                if (!colError) {
                    console.log(`[EXIST] ${col}`);
                } else {
                    console.log(`[MISSING] ${col}: ${colError.message}`);
                }
            }
        }
    }
}

probe();
