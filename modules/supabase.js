/**
 * Supabase Client Module
 * Handles connection to Supabase for data synchronization
 */

const SUPABASE_URL = 'https://pzzaqabdjhczpeffmrrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6emFxYWJkamhjenBlZmZtcnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzE5NDYsImV4cCI6MjA4Mzc0Nzk0Nn0.qMOkm718pCU0LgktrENyx4RutLzaGWexY9Z9dLqcsU8';

// Supabase client instance
let supabaseClient = null;

const SupabaseClient = {
    isOnline: false,
    realtimeCallbacks: {},
    realtimeSubscriptions: [],
    realtimeDebounceTimers: {},    // Debounce timers for realtime events
    isSyncing: {},                  // Flag to ignore own sync events

    // Tables to monitor for realtime changes
    REALTIME_TABLES: ['separacao', 'conferencia', 'historico'],

    // Debounce delay for realtime events (wait for sync to finish)
    REALTIME_DEBOUNCE_MS: 3000,

    async init() {
        try {
            // Check if Supabase library is loaded
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                this.isOnline = true;
                console.log('✅ Supabase conectado!');
                return true;
            } else {
                console.warn('⚠️ Supabase não carregado, usando localStorage');
                this.isOnline = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Erro ao conectar Supabase:', error);
            this.isOnline = false;
            return false;
        }
    },

    /**
     * Initialize realtime subscriptions for all monitored tables
     */
    initRealtimeSubscriptions() {
        if (!this.isOnline || !supabaseClient) {
            console.warn('⚠️ Realtime não disponível - offline');
            return;
        }

        console.log('🔴 Iniciando subscriptions Realtime...');

        this.REALTIME_TABLES.forEach(table => {
            const subscription = supabaseClient
                .channel(`realtime_${table}`)
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: table },
                    (payload) => {
                        console.log(`📡 Mudança em ${table}:`, payload.eventType);
                        this.handleRealtimeChange(table, payload);
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`✅ Realtime ativo para: ${table}`);
                    }
                });

            this.realtimeSubscriptions.push(subscription);
        });
    },

    /**
     * Register a callback for when a table changes
     */
    onRealtimeUpdate(table, callback) {
        if (!this.realtimeCallbacks[table]) {
            this.realtimeCallbacks[table] = [];
        }
        this.realtimeCallbacks[table].push(callback);
    },

    /**
     * Handle realtime change event with debounce
     * Waits for sync operations to complete before triggering reload
     */
    handleRealtimeChange(table, payload) {
        // Ignore events if we're currently syncing this table
        if (this.isSyncing[table]) {
            console.log(`⏸️ Ignorando evento realtime de ${table} (sync em andamento)`);
            return;
        }

        // Clear existing debounce timer for this table
        if (this.realtimeDebounceTimers[table]) {
            clearTimeout(this.realtimeDebounceTimers[table]);
        }

        // Set debounce timer - wait for all sync events to finish
        this.realtimeDebounceTimers[table] = setTimeout(() => {
            console.log(`🔄 Processando atualização remota de ${table}`);
            const callbacks = this.realtimeCallbacks[table] || [];
            callbacks.forEach(callback => {
                try {
                    callback(payload);
                } catch (e) {
                    console.error(`❌ Erro no callback de ${table}:`, e);
                }
            });
        }, this.REALTIME_DEBOUNCE_MS);
    },

    /**
     * Mark table as syncing (to ignore own realtime events)
     */
    setSyncing(table, value) {
        this.isSyncing[table] = value;
    },

    /**
     * Cleanup all realtime subscriptions
     */
    cleanupRealtimeSubscriptions() {
        console.log('🔌 Desconectando Realtime...');
        this.realtimeSubscriptions.forEach(sub => {
            if (sub && supabaseClient) {
                supabaseClient.removeChannel(sub);
            }
        });
        this.realtimeSubscriptions = [];
        this.realtimeCallbacks = {};
    },

    // Generic CRUD operations
    async getAll(table) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            // Supabase has default limit of 1000, increase to 50000 for large tables
            const { data, error } = await supabaseClient
                .from(table)
                .select('*')
                .limit(50000);
            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Erro ao buscar ${table}:`, error);
            return null;
        }
    },

    async insert(table, record) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            const { data, error } = await supabaseClient.from(table).insert(record).select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Erro ao inserir em ${table}:`, error);
            return null;
        }
    },

    async update(table, id, updates) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            const { data, error } = await supabaseClient.from(table).update(updates).eq('id', id).select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Erro ao atualizar ${table}:`, error);
            return null;
        }
    },

    async delete(table, id) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            const { error } = await supabaseClient.from(table).delete().eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error(`Erro ao deletar de ${table}:`, error);
            return null;
        }
    },

    async upsert(table, records) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            const { data, error } = await supabaseClient.from(table).upsert(records).select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Erro ao upsert em ${table}:`, error);
            return null;
        }
    },

    async deleteAll(table) {
        if (!this.isOnline || !supabaseClient) return null;

        try {
            const { error } = await supabaseClient.from(table).delete().neq('id', 0);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error(`Erro ao limpar ${table}:`, error);
            return null;
        }
    },

    // Subscribe to real-time changes (legacy, use initRealtimeSubscriptions instead)
    subscribe(table, callback) {
        if (!this.isOnline || !supabaseClient) return null;

        return supabaseClient
            .channel(`${table}_changes`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: table },
                (payload) => {
                    console.log(`📡 Mudança em ${table}:`, payload.eventType);
                    callback(payload);
                }
            )
            .subscribe();
    },

    unsubscribe(subscription) {
        if (subscription && supabaseClient) {
            supabaseClient.removeChannel(subscription);
        }
    }
};
