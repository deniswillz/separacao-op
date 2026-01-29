
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkColumn() {
    const envText = fs.readFileSync('.env.local', 'utf8');
    const url = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

    const supabase = createClient(url, key);

    console.log('Checking if status_atual column exists...');
    const { data, error } = await supabase
        .from('historico')
        .select('id, status_atual')
        .limit(1);

    if (error) {
        console.error('Error selecting status_atual:', error.message);
    } else {
        console.log('Column status_atual exists. Sample data:', data);
    }
}

checkColumn();
