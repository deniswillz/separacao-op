/**
 * Storage Module
 * Uses Supabase as PRIMARY storage, localStorage as CACHE
 * All data is synchronized across users
 */

const Storage = {
    KEYS: {
        CADASTRO: 'separacao_cadastro',
        ENDERECOS: 'separacao_enderecos',
        EMPENHOS: 'separacao_empenhos',
        BLACKLIST: 'separacao_blacklist',
        SEPARACAO: 'separacao_lista',
        SEPARACAO_INFO: 'separacao_info',
        CONFERENCIA: 'separacao_conferencia',
        CONFERENCIA_INFO: 'separacao_conferencia_info',
        HISTORICO: 'separacao_historico',
        USERS: 'separacao_users'
    },

    // Map localStorage keys to Supabase table names
    TABLE_MAP: {
        'separacao_cadastro': 'cadastro',
        'separacao_enderecos': 'enderecos',
        'separacao_blacklist': 'blacklist',
        'separacao_lista': 'separacao',
        'separacao_conferencia': 'conferencia',
        'separacao_historico': 'historico',
        'separacao_users': 'usuarios'
    },

    /**
     * Save data - saves to localStorage AND Supabase
     */
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            this.syncToSupabase(key, data);
            return true;
        } catch (e) {
            console.error('❌ Erro ao salvar:', e);
            return false;
        }
    },

    /**
     * Sync data to Supabase
     */
    async syncToSupabase(key, data) {
        const table = this.TABLE_MAP[key];

        if (!table) return;
        if (!SupabaseClient?.isOnline) return;
        if (!Array.isArray(data)) return;

        console.log(`📤 Sincronizando ${table}... (${data.length} registros)`);

        // If data is empty, delete all from cloud
        if (data.length === 0) {
            try {
                console.log(`🗑️ Limpando ${table} na nuvem...`);
                await supabaseClient.from(table).delete().gte('id', 1);
                console.log(`✅ ${table} limpo na nuvem`);
            } catch (e) {
                console.warn(`⚠️ Não foi possível limpar ${table} na nuvem`);
            }
            return;
        }

        try {
            // Helper function to convert Brazilian date to ISO format
            const convertBrazilianDateToISO = (value) => {
                if (typeof value !== 'string') return value;
                // Match Brazilian date format: dd/mm/yyyy or dd/mm/yyyy, hh:mm:ss
                const brDateMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s*(\d{2}):(\d{2}):(\d{2}))?$/);
                if (brDateMatch) {
                    const [_, day, month, year, hour = '00', min = '00', sec = '00'] = brDateMatch;
                    return `${year}-${month}-${day}T${hour}:${min}:${sec}`;
                }
                return value;
            };

            // Prepare data
            const preparedData = data.map(item => {
                const prepared = {};
                for (const [k, v] of Object.entries(item)) {
                    if (k === 'id') {
                        if (table === 'usuarios') continue;
                        if (typeof v === 'number' && v > 1000000) continue;
                    }
                    const snakeKey = k.replace(/([A-Z])/g, '_$1').toLowerCase();
                    // Convert dates in date-related fields
                    if (snakeKey.includes('data') || snakeKey.includes('criacao') || snakeKey.includes('finalizacao')) {
                        prepared[snakeKey] = convertBrazilianDateToISO(v);
                    } else {
                        prepared[snakeKey] = v;
                    }
                }
                return prepared;
            });

            // Delete existing data first (handle UUID vs numeric ID)
            try {
                if (table === 'usuarios') {
                    // usuarios uses UUID - delete using not equal to empty UUID
                    await supabaseClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
                } else {
                    // Other tables use numeric ID
                    await supabaseClient.from(table).delete().gte('id', 1);
                }
            } catch (e) {
                // Ignore delete errors
            }

            // Insert data in batches of 500
            const BATCH_SIZE = 500;
            let inserted = 0;

            for (let i = 0; i < preparedData.length; i += BATCH_SIZE) {
                const batch = preparedData.slice(i, i + BATCH_SIZE);
                const result = await supabaseClient.from(table).insert(batch);

                if (result.error) {
                    if (result.error.code === '23505' || result.error.code === '409') {
                        // Use appropriate conflict key based on table
                        const conflictKey = table === 'usuarios' ? 'username' : 'codigo';
                        const upsertResult = await supabaseClient.from(table).upsert(batch, { onConflict: conflictKey });
                        if (upsertResult.error) {
                            console.warn(`⚠️ Upsert falhou para ${table}:`, upsertResult.error);
                        }
                    } else {
                        console.error(`❌ Erro batch:`, result.error);
                        continue;
                    }
                }
                inserted += batch.length;
            }

            console.log(`✅ ${table}: ${inserted}/${data.length} registros sincronizados`);

        } catch (error) {
            console.error(`❌ Erro ao sincronizar ${table}:`, error);
        }
    },

    /**
     * Load data from localStorage
     */
    load(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('❌ Erro ao carregar:', e);
            return null;
        }
    },

    /**
     * Load data from Supabase using pagination
     */
    async loadFromCloud(key) {
        const table = this.TABLE_MAP[key];
        if (!table || !SupabaseClient?.isOnline) return null;

        console.log(`📥 Carregando ${table} da nuvem...`);

        try {
            // Use pagination to load ALL records
            const PAGE_SIZE = 1000;
            let allData = [];
            let page = 0;
            let hasMore = true;

            while (hasMore) {
                const { data: pageData, error } = await supabaseClient
                    .from(table)
                    .select('*')
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

                if (error) {
                    console.error(`❌ Erro ao carregar ${table}:`, error);
                    break;
                }

                if (pageData && pageData.length > 0) {
                    allData = allData.concat(pageData);
                    page++;
                    if (pageData.length < PAGE_SIZE) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            if (allData.length > 0) {
                // Convert snake_case to camelCase
                const convertedData = allData.map(item => {
                    const converted = {};
                    for (const [k, v] of Object.entries(item)) {
                        const camelKey = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
                        converted[camelKey] = v;
                    }
                    return converted;
                });

                localStorage.setItem(key, JSON.stringify(convertedData));
                console.log(`✅ ${table}: ${convertedData.length} registros carregados`);
                return convertedData;
            } else {
                console.log(`📭 ${table} está vazio na nuvem`);
                return [];
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar ${table}:`, error);
        }

        return null;
    },

    /**
     * Remove data
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            const table = this.TABLE_MAP[key];
            if (table && SupabaseClient?.isOnline) {
                supabaseClient.from(table).delete().gte('id', 0);
            }
            return true;
        } catch (e) {
            console.error('❌ Erro ao remover:', e);
            return false;
        }
    },

    /**
     * Clear all app data
     */
    clearAll() {
        Object.values(this.KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    },

    /**
     * Export all data as JSON
     */
    exportAll() {
        const data = {};
        Object.entries(this.KEYS).forEach(([name, key]) => {
            const localData = localStorage.getItem(key);
            data[name] = localData ? JSON.parse(localData) : null;
        });
        return data;
    },

    /**
     * Import data from JSON
     */
    importAll(data) {
        Object.entries(this.KEYS).forEach(([name, key]) => {
            if (data[name]) {
                this.save(key, data[name]);
            }
        });
    },

    /**
     * Load all data from cloud
     */
    async loadAllFromCloud() {
        if (!SupabaseClient?.isOnline) {
            console.warn('⚠️ Offline - usando dados locais');
            return;
        }

        console.log('📥 Carregando dados da nuvem...');

        for (const [name, key] of Object.entries(this.KEYS)) {
            const table = this.TABLE_MAP[key];
            if (!table) continue;

            const cloudData = await this.loadFromCloud(key);

            if (cloudData !== null) {
                localStorage.setItem(key, JSON.stringify(cloudData));
            }
        }

        console.log('✅ Dados sincronizados com a nuvem!');
    },

    /**
     * Upload all local data to cloud
     */
    async uploadToCloud() {
        if (!SupabaseClient?.isOnline) {
            console.warn('⚠️ Offline - não é possível enviar');
            return;
        }

        console.log('📤 Enviando dados locais para a nuvem...');

        for (const [name, key] of Object.entries(this.KEYS)) {
            const table = this.TABLE_MAP[key];
            if (!table) continue;

            const localData = localStorage.getItem(key);
            if (localData) {
                const parsed = JSON.parse(localData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    await this.syncToSupabase(key, parsed);
                }
            }
        }

        console.log('✅ Dados enviados para a nuvem!');
    }
};
