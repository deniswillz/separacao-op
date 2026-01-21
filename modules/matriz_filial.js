/**
 * Matriz x Filial Module
 * Tracks finished products (PA) from Matrix to Branch
 */

const MatrizFilial = {
    records: [],
    historico: [],
    searchQuery: '',

    init() {
        // Load saved data
        const saved = Storage.load(Storage.KEYS.MATRIZ_FILIAL);
        if (saved) this.records = saved;

        const savedHist = Storage.load(Storage.KEYS.MATRIZ_FILIAL_HISTORICO);
        if (savedHist) this.historico = savedHist;

        // Search support
        const searchInput = document.getElementById('matrizFilialSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render();
            });
        }

        this.render();
    },

    /**
     * Add new finished product records
     * Called when a Separation List is generated
     */
    addRecords(newRecords) {
        // Filter out OPs that already have a PA record
        const existingOPs = new Set([
            ...this.records.map(r => r.op),
            ...this.historico.map(r => r.op)
        ]);
        const filtered = newRecords.filter(r => !existingOPs.has(r.op));

        if (filtered.length === 0) return;

        const timestamp = new Date().toISOString();
        const formatted = filtered.map(r => ({
            id: Storage.generateUUID(),
            op: r.op,
            produto: r.produto,
            descricao: r.descricao,
            quantidade: r.quantidade,
            status: 'qualidade', // Start at Quality
            dataCriacao: timestamp,
            historicoStatus: [
                { status: 'qualidade', data: timestamp, usuario: Auth.currentUser?.nome || 'Sistema' }
            ]
        }));

        this.records = [...formatted, ...this.records];
        this.save();
        this.render();

        Auditoria.log('GERAR_PA_MATRIZ', { count: formatted.length });
    },

    save() {
        Storage.save(Storage.KEYS.MATRIZ_FILIAL, this.records);
        Storage.save(Storage.KEYS.MATRIZ_FILIAL_HISTORICO, this.historico);
    },

    updateStatus(id, newStatus) {
        const record = this.records.find(r => r.id === id);
        if (!record) return;

        const timestamp = new Date().toISOString();
        record.status = newStatus;
        record.historicoStatus.push({
            status: newStatus,
            data: timestamp,
            usuario: Auth.currentUser?.nome || 'Sistema'
        });

        this.save();
        this.render();

        Auditoria.log('ALTERAR_STATUS_PA', { op: record.op, status: newStatus });
    },

    arquivar(id) {
        const index = this.records.findIndex(r => r.id === id);
        if (index === -1) return;

        const record = this.records.splice(index, 1)[0];
        this.historico.unshift(record);

        // Keep only last 500 history items
        if (this.historico.length > 500) this.historico = this.historico.slice(0, 500);

        this.save();
        this.render();
        App.showToast('Movimentação arquivada no histórico', 'success');
    },

    render() {
        const container = document.getElementById('matrizFilialCards');
        if (!container) return;

        if (this.records.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="empty-text">Nenhum produto acabado pendente</p>
                    <button class="btn btn-outline" onclick="MatrizFilial.showHistorico()">📚 Ver Histórico de Movimentações</button>
                </div>
            `;
            return;
        }

        // Apply filtering
        const filtered = this.records.filter(r => {
            const query = this.searchQuery.trim();
            if (!query) return true;
            return r.op.toLowerCase().includes(query) ||
                r.produto.toLowerCase().includes(query) ||
                r.descricao.toLowerCase().includes(query);
        });

        if (filtered.length === 0 && this.records.length > 0) {
            container.innerHTML = `
                <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                    <button class="btn btn-outline btn-sm" onclick="MatrizFilial.showHistorico()">📚 Histórico Completo</button>
                </div>
                <p class="empty-text">Nenhum resultado encontrado para sua pesquisa.</p>
            `;
            return;
        }

        const cardsHTML = filtered.map(r => `
            <div class="pa-card status-${r.status}">
                <div class="pa-card-header">
                    <span class="pa-op">OP: ${r.op}</span>
                    <span class="pa-status-badge">${this.getStatusLabel(r.status)}</span>
                </div>
                <div class="pa-card-body">
                    <h4 class="pa-produto">${r.produto}</h4>
                    <p class="pa-desc">${r.descricao}</p>
                    <div class="pa-qty">Qtd: <strong>${r.quantidade}</strong></div>
                    <div class="pa-timeline">
                        <small>🔄 Última atualização: ${new Date(r.historicoStatus[r.historicoStatus.length - 1].data).toLocaleString()}</small>
                    </div>
                </div>
                <div class="pa-card-footer">
                    ${this.renderActions(r)}
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                <button class="btn btn-outline btn-sm" onclick="MatrizFilial.showHistorico()">📚 Histórico Completo</button>
            </div>
            <div class="pa-cards-grid">${cardsHTML}</div>
        `;
    },

    getStatusLabel(status) {
        const labels = {
            'qualidade': '🔬 Em Qualidade',
            'enderecar': '📍 Endereçar',
            'transito': '🚚 Em Trânsito',
            'recebido': '✅ Recebido'
        };
        return labels[status] || status;
    },

    renderActions(r) {
        if (r.status === 'qualidade') {
            return `<button class="btn btn-primary btn-sm" onclick="MatrizFilial.updateStatus('${r.id}', 'enderecar')">✅ Aprovar Qualidade</button>`;
        }
        if (r.status === 'enderecar') {
            return `<button class="btn btn-primary btn-sm" onclick="MatrizFilial.updateStatus('${r.id}', 'transito')">🚚 Enviar p/ Filial</button>`;
        }
        if (r.status === 'transito') {
            return `<button class="btn btn-success btn-sm" onclick="MatrizFilial.updateStatus('${r.id}', 'recebido')">📦 Confirmar Recebimento</button>`;
        }
        if (r.status === 'recebido') {
            return `<button class="btn btn-outline btn-sm" onclick="MatrizFilial.arquivar('${r.id}')">📚 Arquivar no Histórico</button>`;
        }
        return ``;
    },

    showHistorico() {
        const rows = this.historico.map(r => `
            <tr>
                <td>${r.op}</td>
                <td>${r.produto}</td>
                <td class="center">${r.quantidade}</td>
                <td class="center">${new Date(r.dataCriacao).toLocaleDateString()}</td>
                <td>${r.historicoStatus.map(h => `<small><strong>${this.getStatusLabel(h.status)}</strong> (${new Date(h.data).toLocaleDateString()})</small>`).join(' → ')}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="center">Nenhum histórico registrado</td></tr>';

        const body = `
            <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>OP</th>
                            <th>Produto</th>
                            <th class="center">Qtd</th>
                            <th class="center">Data</th>
                            <th>Fluxo de Movimentação</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        App.showModal('📚 Histórico de Movimentações Matriz x Filial', body, `
            <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
        `, 'large');
    }
};
