/**
 * Histórico Module
 * Manages finished orders history
 */

const Historico = {
    registros: [],
    cardsContainer: null,
    emptyState: null,
    searchInput: null,

    init() {
        this.cardsContainer = document.getElementById('historicoListas');
        this.emptyState = document.getElementById('emptyHistorico');
        this.searchInput = document.getElementById('searchHistorico');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.HISTORICO);
        if (saved) {
            this.registros = saved;
        }

        // Setup event listeners
        this.searchInput.addEventListener('input', () => {
            this.render();
        });

        document.getElementById('btnExportarHistorico').addEventListener('click', () => {
            this.exportarTudo();
        });

        // Add filter listeners
        document.getElementById('filtroArmazemHistorico').addEventListener('change', () => this.render());
        document.getElementById('filtroDataInicioHistorico').addEventListener('change', () => this.render());
        document.getElementById('filtroDataFimHistorico').addEventListener('change', () => this.render());

        // Register realtime callback
        SupabaseClient.onRealtimeUpdate('historico', (payload) => {
            console.log('🔄 Historico: recebida atualização remota');
            this.reload();
        });

        this.render();
    },

    /**
     * Reload data from cloud and refresh UI
     */
    async reload() {
        const cloudData = await Storage.loadFromCloud(Storage.KEYS.HISTORICO);
        // Só atualiza se recebeu dados válidos (array, não null)
        // null indica que a cloud estava vazia ou sincronizando
        if (Array.isArray(cloudData)) {
            this.registros = cloudData;
            this.render();
            // Also update Dashboard
            Dashboard.render();
        }
    },

    adicionarRegistro(conferencia) {
        const registro = {
            id: Storage.generateUUID(),
            nome: conferencia.nome,
            armazem: conferencia.armazem,
            ordens: conferencia.ordens,
            documento: conferencia.documento,
            responsavelSeparacao: conferencia.responsavelSeparacao,
            responsavelConferencia: conferencia.responsavelConferencia,
            dataConferencia: conferencia.dataConferencia,
            dataFinalizacao: conferencia.dataFinalizacao || new Date().toISOString(),
            itens: conferencia.itens,
            totalItens: conferencia.itens.length,
            itensOK: conferencia.itens.filter(i => i.ok).length
        };

        this.registros.unshift(registro); // Add to beginning
        this.save();
        this.render();
    },

    save() {
        Storage.save(Storage.KEYS.HISTORICO, this.registros);
    },

    verDetalhes(id) {
        const registro = this.registros.find(r => String(r.id) === String(id));
        if (!registro) return;

        const itensHTML = registro.itens.map(item => `
            <tr>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.quantidade}</td>
                <td>${item.ok ? '✅' : '❌'}</td>
                <td>${item.observacao || '-'}</td>
            </tr>
        `).join('');

        const body = `
            <div style="margin-bottom: 1rem;">
                <p><strong>Armazém:</strong> ${registro.armazem}</p>
                <p><strong>Documento:</strong> ${registro.documento || 'N/A'}</p>
                <p><strong>Ordens:</strong> ${registro.ordens.join(', ')}</p>
                <p><strong>Separado por:</strong> ${registro.responsavelSeparacao || 'N/A'}</p>
                <p><strong>Conferido por:</strong> ${registro.responsavelConferencia || 'N/A'}</p>
                <p><strong>Finalizado em:</strong> ${registro.dataFinalizacao}</p>
            </div>
            <table class="data-table" style="font-size: 0.85rem;">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th>OK</th>
                        <th>Obs</th>
                    </tr>
                </thead>
                <tbody>
                    ${itensHTML}
                </tbody>
            </table>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
            <button class="btn btn-primary" onclick="Historico.exportarRegistro(${registro.id})">📤 Exportar Excel</button>
        `;

        App.showModal(`Detalhes: ${registro.nome}`, body, footer);
    },

    exportarRegistro(id) {
        const registro = this.registros.find(r => String(r.id) === String(id));
        if (!registro) return;

        const exportData = registro.itens.map(item => ({
            'Código': item.codigo,
            'Descrição': item.descricao,
            'Quantidade': item.quantidade,
            'Status': item.ok ? 'OK' : 'Pendente',
            'Observação': item.observacao || ''
        }));

        ExcelHelper.exportToExcel(exportData, `Historico_${registro.nome.replace(/\s/g, '_')}`);
        App.showToast('Registro exportado!', 'success');
    },

    exportarTudo() {
        if (this.registros.length === 0) {
            App.showToast('Nenhum registro para exportar', 'warning');
            return;
        }

        const exportData = this.registros.map(r => ({
            'Nome': r.nome,
            'Armazém': r.armazem,
            'Ordens': r.ordens.join(', '),
            'Documento': r.documento || '',
            'Resp. Separação': r.responsavelSeparacao || '',
            'Resp. Conferência': r.responsavelConferencia || '',
            'Data Finalização': r.dataFinalizacao,
            'Total Itens': r.totalItens,
            'Itens OK': r.itensOK
        }));

        ExcelHelper.exportToExcel(exportData, `Historico_Completo_${new Date().toISOString().slice(0, 10)}`);
        App.showToast('Histórico exportado!', 'success');
    },

    deletarRegistro(id) {
        const registro = this.registros.find(r => String(r.id) === String(id));
        if (!registro) return;

        if (!confirm(`Deseja realmente excluir o registro "${registro.nome}" do histórico? Isso removerá também quaisquer registros pendentes vinculados em Matriz x Filial.`)) {
            return;
        }

        // CASCADE DELETE: Matriz x Filial (remover registros das OPs)
        if (typeof MatrizFilial !== 'undefined' && registro.ordens) {
            MatrizFilial.removeRecordsByOPs(registro.ordens);
        }

        this.registros = this.registros.filter(r => String(r.id) !== String(id));
        this.save();
        this.render();
        App.showToast('Registro excluído do histórico e dependências!', 'success');
    },

    render() {
        const searchTerm = this.searchInput.value.toLowerCase();
        const armazemFilter = document.getElementById('filtroArmazemHistorico').value;
        const dataInicio = document.getElementById('filtroDataInicioHistorico').value;
        const dataFim = document.getElementById('filtroDataFimHistorico').value;

        let filtered = this.registros;

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(r =>
                r.nome.toLowerCase().includes(searchTerm) ||
                r.armazem.toLowerCase().includes(searchTerm) ||
                (r.ordens && r.ordens.some(op => op.toLowerCase().includes(searchTerm)))
            );
        }

        // Warehouse filter
        if (armazemFilter) {
            filtered = filtered.filter(r => r.armazem === armazemFilter);
        }

        // Date range filter
        if (dataInicio || dataFim) {
            filtered = filtered.filter(r => {
                const dataFinalizacao = new Date(r.dataFinalizacao || r.data_finalizacao);
                if (dataInicio) {
                    const dInicio = new Date(dataInicio);
                    dInicio.setHours(0, 0, 0, 0);
                    if (dataFinalizacao < dInicio) return false;
                }
                if (dataFim) {
                    const dFim = new Date(dataFim);
                    dFim.setHours(23, 59, 59, 999);
                    if (dataFinalizacao > dFim) return false;
                }
                return true;
            });
        }

        // Sort A-Z by name
        filtered = filtered.sort((a, b) => a.nome.localeCompare(b.nome));

        if (filtered.length === 0) {
            this.cardsContainer.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.cardsContainer.innerHTML = filtered.map(registro => {
            // Calculate totals dynamically
            const totalItens = registro.itens ? registro.itens.length : 0;
            const itensOK = registro.itens ? registro.itens.filter(i => i.ok).length : 0;

            return `
            <div class="list-card completed" onclick="Historico.verDetalhes('${registro.id}')">
                <div class="list-card-header">
                    <span class="list-card-title">${registro.nome}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="list-card-badge completed">Finalizado</span>
                        ${Auth.isAdmin() ? `<button class="btn-delete-item" onclick="event.stopPropagation(); Historico.deletarRegistro('${registro.id}')" title="Excluir registro">✕</button>` : ''}
                    </div>
                </div>
                <div class="list-card-info">
                    <span><strong>Armazém:</strong> ${registro.armazem}</span>
                    <span><strong>Conferido por:</strong> ${registro.responsavel_conferencia || registro.responsavelConferencia || 'N/A'}</span>
                    <span><strong>Resultado:</strong> ${itensOK}/${totalItens} OK</span>
                </div>
                <div class="list-card-footer">
                    <span class="list-card-date">${this.formatDate(registro.data_finalizacao || registro.dataFinalizacao)}</span>
                    <span class="list-card-count">${totalItens} itens</span>
                </div>
            </div>
        `}).join('');
    },

    formatDate(dateStr) {
        if (!dateStr) return 'Data desconhecida';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('pt-BR');
        } catch (e) {
            return dateStr;
        }
    },

    /**
     * BI: Get SKUs with frequent discrepancies (missing in conference)
     */
    getDiscrepancyReport() {
        const counts = {};
        this.registros.forEach(reg => {
            reg.itens.forEach(item => {
                if (item.falta) {
                    counts[item.codigo] = (counts[item.codigo] || 0) + 1;
                }
            });
        });

        return Object.entries(counts)
            .map(([codigo, qde]) => ({ codigo, qde }))
            .sort((a, b) => b.qde - a.qde);
    },

    /**
     * BI: Automatic ABC Classification based on movement frequency
     */
    calculateABC() {
        const movement = {};
        this.registros.forEach(reg => {
            reg.itens.forEach(item => {
                movement[item.codigo] = (movement[item.codigo] || 0) + 1;
            });
        });

        const sorted = Object.entries(movement)
            .sort((a, b) => b[1] - a[1]);

        const total = sorted.length;
        if (total === 0) return {};

        const result = {};
        sorted.forEach(([codigo, count], index) => {
            const percentile = (index + 1) / total;
            if (percentile <= 0.2) result[codigo] = 'A';
            else if (percentile <= 0.5) result[codigo] = 'B';
            else result[codigo] = 'C';
        });

        return result;
    }
};
