/**
 * Storage Module
 * Uses Supabase as PRIMARY and ONLY storage
 * In-memory cache for performance
 * NO localStorage for app data
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
        USERS: 'separacao_users',
        AUDITORIA: 'separacao_auditoria'
    },

    // Map localStorage keys to Supabase table names
    TABLE_MAP: {
        'separacao_cadastro': 'cadastro',
        'separacao_enderecos': 'enderecos',
        'separacao_blacklist': 'blacklist',
        'separacao_lista': 'separacao',
        'separacao_conferencia': 'conferencia',
        'separacao_historico': 'historico',
        'separacao_users': 'usuarios',
        'separacao_auditoria': 'auditoria'
    },

    // In-memory cache (replaces localStorage)
    _cache: {},

    // Generate UUID v4 - works in all browsers
    generateUUID() {
        // Use crypto.randomUUID if available (modern browsers)
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // Debounce timers for each key
    syncTimers: {},
    SYNC_DEBOUNCE_MS: 1500, // Wait 1.5 seconds before syncing

    /**
     * Save data - saves to in-memory cache AND Supabase (with debounce)
     */
    save(key, data) {
        try {
            // Save to in-memory cache
            this._cache[key] = JSON.parse(JSON.stringify(data));

            // Debounce sync to avoid multiple rapid calls
            if (this.syncTimers[key]) {
                clearTimeout(this.syncTimers[key]);
            }
            this.syncTimers[key] = setTimeout(() => {
                this.syncToSupabase(key, data);
            }, this.SYNC_DEBOUNCE_MS);

            return true;
        } catch (e) {
            console.error('❌ Erro ao salvar:', e);
            return false;
        }
    },

    /**
     * Sync data to Supabase
     * Uses UPSERT strategy to avoid race conditions where data appears empty during sync
     */
    async syncToSupabase(key, data) {
        const table = this.TABLE_MAP[key];

        if (!table) return;
        if (!SupabaseClient?.isOnline) {
            console.warn('⚠️ Offline - dados salvos apenas em memória');
            return;
        }
        if (!Array.isArray(data)) return;

        console.log(`📤 Sincronizando ${table}... (${data.length} registros)`);

        // Mark as syncing to ignore own realtime events
        if (SupabaseClient?.setSyncing) {
            SupabaseClient.setSyncing(table, true);
        }

        // If data is empty, delete all from cloud
        if (data.length === 0) {
            try {
                console.log(`🗑️ Limpando ${table} na nuvem...`);
                const uuidTables = ['usuarios', 'separacao', 'conferencia', 'historico'];
                if (uuidTables.includes(table)) {
                    await supabaseClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
                } else {
                    await supabaseClient.from(table).delete().gte('id', 1);
                }
                console.log(`✅ ${table} limpo na nuvem`);
            } catch (e) {
                console.warn(`⚠️ Não foi possível limpar ${table} na nuvem`);
            }
            // Done syncing
            if (SupabaseClient?.setSyncing) {
                SupabaseClient.setSyncing(table, false);
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

            // Prepare data with IDs for upsert
            const preparedData = data.map(item => {
                const prepared = {};
                for (const [k, v] of Object.entries(item)) {
                    // Skip id ONLY for usuarios (Supabase generates UUID)
                    // Other tables use JavaScript-generated IDs that must be kept
                    if (k === 'id' && table === 'usuarios') {
                        continue;
                    }

                    // Skip fields that don't exist in Supabase tables
                    const skipFields = [
                        'total_itens', 'itens_ok', 'itens_o_k', 'totalItens', 'itensOk', 'itensOK',
                        'itensTransferenciaVerificados', 'itens_transferencia_verificados'
                    ];
                    if (skipFields.includes(k)) continue;

                    const snakeKey = k.replace(/([A-Z])/g, '_$1').toLowerCase();

                    // Skip snake_case versions too
                    if (skipFields.includes(snakeKey)) continue;

                    // Always try to convert Brazilian dates to ISO format
                    prepared[snakeKey] = convertBrazilianDateToISO(v);
                }
                return prepared;
            });

            // Get IDs from prepared data to identify records to delete
            const localIds = preparedData.map(item => item.id).filter(id => id !== undefined);

            // STEP 1: UPSERT all local records (insert or update)
            const BATCH_SIZE = 500;
            let upserted = 0;
            const totalBatches = Math.ceil(preparedData.length / BATCH_SIZE);

            console.log(`📊 ${table}: ${preparedData.length} registros para enviar em ${totalBatches} lotes...`);

            for (let i = 0; i < preparedData.length; i += BATCH_SIZE) {
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                const batch = preparedData.slice(i, i + BATCH_SIZE);

                console.log(`📤 ${table}: Enviando lote ${batchNum}/${totalBatches} (${batch.length} registros)...`);

                // Use upsert with 'id' as conflict key for most tables
                // For usuarios, use 'username' as conflict key
                const conflictKey = table === 'usuarios' ? 'username' : 'id';
                const result = await supabaseClient.from(table).upsert(batch, {
                    onConflict: conflictKey,
                    ignoreDuplicates: false
                });

                if (result.error) {
                    console.error(`❌ Erro upsert batch ${batchNum} de ${table}:`, result.error);
                    // Try individual inserts as fallback
                    let individualSuccess = 0;
                    for (const record of batch) {
                        try {
                            await supabaseClient.from(table).upsert([record], {
                                onConflict: conflictKey,
                                ignoreDuplicates: false
                            });
                            individualSuccess++;
                        } catch (e) {
                            console.warn(`⚠️ Falha ao sincronizar registro:`, e);
                        }
                    }
                    upserted += individualSuccess;
                    console.log(`🔄 Lote ${batchNum}: ${individualSuccess}/${batch.length} salvos individualmente`);
                } else {
                    upserted += batch.length;
                    console.log(`✅ Lote ${batchNum}: ${batch.length} registros enviados (total: ${upserted})`);
                }
            }

            // STEP 2: Delete records that exist in cloud but not locally
            // This ensures removed records are deleted without leaving the table empty
            if (localIds.length > 0 && table !== 'usuarios') {
                try {
                    // Convert IDs to strings for comparison
                    const localIdStrings = localIds.map(id => String(id));

                    // Get all cloud IDs
                    const { data: cloudRecords, error: fetchError } = await supabaseClient
                        .from(table)
                        .select('id');

                    if (!fetchError && cloudRecords) {
                        const cloudIds = cloudRecords.map(r => String(r.id));
                        const idsToDelete = cloudIds.filter(id => !localIdStrings.includes(id));

                        if (idsToDelete.length > 0) {
                            console.log(`🗑️ Removendo ${idsToDelete.length} registros obsoletos de ${table}`);
                            // Delete in batches
                            for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
                                const deleteBatch = idsToDelete.slice(i, i + BATCH_SIZE);
                                await supabaseClient.from(table).delete().in('id', deleteBatch);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao limpar registros obsoletos de ${table}:`, e);
                }
            }

            console.log(`✅ ${table}: ${upserted}/${data.length} registros sincronizados`);

        } catch (error) {
            console.error(`❌ Erro ao sincronizar ${table}:`, error);
        } finally {
            // Done syncing - always reset flag
            if (SupabaseClient?.setSyncing) {
                SupabaseClient.setSyncing(table, false);
            }
        }
    },

    /**
     * Load data from in-memory cache (primary) or Supabase (fallback)
     */
    load(key) {
        // Return from cache if available
        if (this._cache[key] !== undefined) {
            return this._cache[key];
        }
        // Cache miss - return null, data needs to be loaded from cloud
        return null;
    },

    /**
     * Load data from Supabase using pagination
     * Supports loading thousands of records (7000+)
     */
    async loadFromCloud(key) {
        const table = this.TABLE_MAP[key];
        if (!table || !SupabaseClient?.isOnline) return null;

        // Se está sincronizando, não recarregar (evita ler dados vazios durante delete+insert)
        if (SupabaseClient?.isSyncing?.[table]) {
            console.log(`⏸️ ${table} está sincronizando, mantendo dados em cache`);
            return this._cache[key] || null;
        }

        console.log(`📥 Carregando ${table} da nuvem...`);

        try {
            // Supabase has a default limit of 1000 records per request
            // Use smaller page size to ensure all pages are fetched
            const PAGE_SIZE = 1000;
            let allData = [];
            let page = 0;
            let hasMore = true;

            // First, get the total count
            const { count: totalCount } = await supabaseClient
                .from(table)
                .select('*', { count: 'exact', head: true });

            console.log(`📊 ${table}: ${totalCount || '?'} registros no total`);

            while (hasMore) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;

                const { data: pageData, error } = await supabaseClient
                    .from(table)
                    .select('*')
                    .range(from, to);

                if (error) {
                    console.error(`❌ Erro ao carregar ${table}:`, error);
                    break;
                }

                if (pageData && pageData.length > 0) {
                    allData = allData.concat(pageData);
                    console.log(`📊 ${table}: página ${page + 1} - ${allData.length}/${totalCount || '?'} registros carregados...`);
                    page++;

                    // Check if we have all records or got less than page size
                    if (totalCount && allData.length >= totalCount) {
                        hasMore = false;
                    } else if (pageData.length < PAGE_SIZE) {
                        hasMore = false;
                    }
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

                // Save to in-memory cache
                this._cache[key] = convertedData;
                console.log(`✅ ${table}: ${convertedData.length} registros carregados`);
                return convertedData;
            } else {
                // Cloud is empty - preserve cache data if exists
                console.log(`📭 ${table} está vazio na nuvem`);
                if (this._cache[key]) {
                    return this._cache[key];
                }
                return [];
            }
        } catch (error) {
            console.error(`❌ Erro ao carregar ${table}:`, error);
        }

        return this._cache[key] || null;
    },

    /**
     * Remove data
     */
    remove(key) {
        try {
            // Remove from cache
            delete this._cache[key];

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
        // Clear in-memory cache
        this._cache = {};
    },

    /**
     * Export all data as JSON
     */
    exportAll() {
        const data = {};
        Object.entries(this.KEYS).forEach(([name, key]) => {
            // Get data from cache
            data[name] = this._cache[key] || null;
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
            console.warn('⚠️ Offline - usando dados em cache');
            return;
        }

        console.log('📥 Carregando dados da nuvem...');

        for (const [name, key] of Object.entries(this.KEYS)) {
            const table = this.TABLE_MAP[key];
            if (!table) continue;

            // loadFromCloud updates cache automatically
            await this.loadFromCloud(key);
        }

        console.log('✅ Dados sincronizados com a nuvem!');
    },

    /**
     * Upload all cached data to cloud
     */
    async uploadToCloud() {
        if (!SupabaseClient?.isOnline) {
            console.warn('⚠️ Offline - não é possível enviar');
            return;
        }

        console.log('📤 Enviando dados em cache para a nuvem...');

        for (const [name, key] of Object.entries(this.KEYS)) {
            const table = this.TABLE_MAP[key];
            if (!table) continue;

            const cachedData = this._cache[key];
            if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
                await this.syncToSupabase(key, cachedData);
            }
        }

        console.log('✅ Dados enviados para a nuvem!');
    },

    // ==================== BACKUP SYSTEM ====================

    BACKUP_TIME_HOUR: 17,
    BACKUP_TIME_MINUTE: 45,
    LAST_BACKUP_KEY: 'separacao_last_backup_date',

    /**
     * Check if backup should run (at 17:45 if not done today)
     */
    checkAutoBackup() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Only run at or after 17:45
        if (currentHour < this.BACKUP_TIME_HOUR ||
            (currentHour === this.BACKUP_TIME_HOUR && currentMinute < this.BACKUP_TIME_MINUTE)) {
            return;
        }

        // Check if already backed up today (use sessionStorage for backup date)
        const today = now.toISOString().split('T')[0];
        const lastBackup = sessionStorage.getItem(this.LAST_BACKUP_KEY);

        if (lastBackup === today) {
            console.log('📦 Backup já realizado hoje');
            return;
        }

        // Perform backup
        console.log('📦 Iniciando backup automático das 17:45...');
        this.createBackup().then(() => {
            sessionStorage.setItem(this.LAST_BACKUP_KEY, today);
        });
    },

    /**
     * Create a backup of all data
     */
    async createBackup() {
        if (!SupabaseClient?.isOnline) {
            console.warn('⚠️ Offline - backup não disponível');
            return { success: false, message: 'Sistema offline' };
        }

        try {
            // Collect all data
            const backupData = {
                separacao: this.load(this.KEYS.SEPARACAO) || [],
                conferencia: this.load(this.KEYS.CONFERENCIA) || [],
                historico: this.load(this.KEYS.HISTORICO) || [],
                cadastro: this.load(this.KEYS.CADASTRO) || [],
                enderecos: this.load(this.KEYS.ENDERECOS) || [],
                blacklist: this.load(this.KEYS.BLACKLIST) || []
            };

            const backup = {
                data_backup: new Date().toISOString(),
                dados: JSON.stringify(backupData),
                usuario: Auth?.currentUser?.nome || 'Sistema',
                tipo: 'automatico'
            };

            // Save to Supabase backups table
            const result = await supabaseClient.from('backups').insert([backup]);

            if (result.error) {
                console.error('❌ Erro ao criar backup:', result.error);
                return { success: false, message: result.error.message };
            }

            console.log('✅ Backup criado com sucesso!');
            return { success: true, message: 'Backup criado com sucesso!' };

        } catch (error) {
            console.error('❌ Erro no backup:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Get list of available backups
     */
    async getBackups() {
        if (!SupabaseClient?.isOnline) {
            return [];
        }

        try {
            const { data, error } = await supabaseClient
                .from('backups')
                .select('*')
                .order('data_backup', { ascending: false })
                .limit(10);

            if (error) {
                console.error('❌ Erro ao listar backups:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('❌ Erro:', error);
            return [];
        }
    },

    /**
     * Restore from a backup
     */
    async restoreBackup(backupId) {
        if (!SupabaseClient?.isOnline) {
            return { success: false, message: 'Sistema offline' };
        }

        try {
            // Get backup data
            const { data, error } = await supabaseClient
                .from('backups')
                .select('*')
                .eq('id', backupId)
                .single();

            if (error || !data) {
                return { success: false, message: 'Backup não encontrado' };
            }

            const backupData = JSON.parse(data.dados);

            // Restore each type of data
            if (backupData.separacao) {
                this.save(this.KEYS.SEPARACAO, backupData.separacao);
            }
            if (backupData.conferencia) {
                this.save(this.KEYS.CONFERENCIA, backupData.conferencia);
            }
            if (backupData.historico) {
                this.save(this.KEYS.HISTORICO, backupData.historico);
            }
            if (backupData.cadastro) {
                this.save(this.KEYS.CADASTRO, backupData.cadastro);
            }
            if (backupData.enderecos) {
                this.save(this.KEYS.ENDERECOS, backupData.enderecos);
            }
            if (backupData.blacklist) {
                this.save(this.KEYS.BLACKLIST, backupData.blacklist);
            }

            console.log('✅ Backup restaurado com sucesso!');
            return { success: true, message: 'Backup restaurado! Recarregue a página.' };

        } catch (error) {
            console.error('❌ Erro ao restaurar:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Create manual backup
     */
    async createManualBackup() {
        const result = await this.createBackup();
        if (result.success) {
            const today = new Date().toISOString().split('T')[0];
            sessionStorage.setItem(this.LAST_BACKUP_KEY, today);
        }
        return result;
    }
};
