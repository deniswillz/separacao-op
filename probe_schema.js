
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function probeSchema() {
    console.log('Probing historico table...');
    const { data, error } = await supabase
        .from('historico')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching from historico:', error);
    } else {
        console.log('Sample data from historico:', data);
        if (data && data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            console.log('Table is empty.');
        }
    }
}

probeSchema();
