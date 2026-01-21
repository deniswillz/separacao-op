/**
 * Auditoria Module
 * Tracks system events and user actions
 */

const Auditoria = {
    logs: [],

    init() {
        // Load saved logs
        this.reload();
    },

    async reload() {
        const saved = Storage.load(Storage.KEYS.AUDITORIA);
        if (saved) {
            this.logs = saved;
        } else if (SupabaseClient?.isOnline) {
            const cloudData = await Storage.loadFromCloud(Storage.KEYS.AUDITORIA);
            if (Array.isArray(cloudData)) {
                this.logs = cloudData;
            }
        }
    },

    /**
     * Log a new event
     * @param {string} acao - Action performed (e.g., 'CRIAR_LISTA', 'FINALIZAR_CONFERENCIA')
     * @param {object} detalhes - Additional info
     */
    log(acao, detalhes = {}) {
        const entry = {
            id: Storage.generateUUID(),
            data: new Date().toISOString(),
            usuario: Auth.currentUser ? Auth.currentUser.nome : 'Sistema',
            acao: acao,
            detalhes: JSON.stringify(detalhes)
        };

        this.logs.unshift(entry); // Add to beginning

        // Keep only last 1000 logs locally
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(0, 1000);
        }

        this.save();
    },

    save() {
        Storage.save(Storage.KEYS.AUDITORIA, this.logs);
    }
};
