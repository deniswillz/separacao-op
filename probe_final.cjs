
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function probe() {
    const envText = fs.readFileSync('.env.local', 'utf8');
    const url = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

    if (!url || !key) {
        console.error('Credentials not found');
        return;
    }

    const supabase = createClient(url, key);

    console.log('--- Table: conferencia ---');
    const { data: conf, error: confErr } = await supabase.from('conferencia').select('*').limit(1);
    if (confErr) console.error(confErr.message);
    else console.log('Columns:', Object.keys(conf[0] || {}));

    console.log('--- Table: historico ---');
    const { data: hist, error: histErr } = await supabase.from('historico').select('*').limit(1);
    if (histErr) console.error(histErr.message);
    else console.log('Columns:', Object.keys(hist[0] || {}));

    console.log('--- Table: usuarios ---');
    const { data: user, error: userErr } = await supabase.from('usuarios').select('*').limit(1);
    if (userErr) console.error(userErr.message);
    else console.log('Columns:', Object.keys(user[0] || {}));
}

probe();
