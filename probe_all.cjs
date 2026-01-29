
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function probe() {
    const envText = fs.readFileSync('.env.local', 'utf8');
    const url = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

    const supabase = createClient(url, key);

    // List of tables to check
    const tables = ['separacao', 'conferencia', 'historico', 'blacklist', 'enderecos', 'usuarios', 'tea', 'rastreio'];

    for (const table of tables) {
        console.log(`--- Table: ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Status: Not found or Error: ${error.message}`);
        } else {
            console.log(`Status: Found. Columns:`, Object.keys(data[0] || {}));
            if (data[0]) console.log('Sample Data:', JSON.stringify(data[0]).slice(0, 100));
        }
    }
}

probe();
