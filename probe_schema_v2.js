
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const lines = envLocal.split('\n');
const env = {};
lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim();
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function probeSchema() {
    console.log('Probing historico table columns...');
    // Fetch just one row to see the keys
    const { data, error } = await supabase
        .from('historico')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching from historico:', error.message);
    } else if (data && data.length > 0) {
        console.log('Columns found in historico table:', Object.keys(data[0]));
        console.log('Sample data:', data[0]);
    } else {
        console.log('historico table is empty. Trying to get column names from information_schema (if possible)...');
        // Note: Remote Supabase usually doesn't allow direct information_schema access via anon key,
        // but we can try to insert a dummy row or just guess common names.
    }
}

probeSchema();
