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

        this.render();
    },

    adicionarRegistro(conferencia) {
        const registro = {
            id: Date.now(),
            nome: conferencia.nome,
            armazem: conferencia.armazem,
            ordens: conferencia.ordens,
            documento: conferencia.documento,
            responsavelSeparacao: conferencia.responsavelSeparacao,
            responsavelConferencia: conferencia.responsavelConferencia,
            dataConferencia: conferencia.dataConferencia,
            dataFinalizacao: conferencia.dataFinalizacao || new Date().toLocaleString('pt-BR'),
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
        const registro = this.registros.find(r => r.id === id);
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
        const registro = this.registros.find(r => r.id === id);
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
        if (!confirm('Deseja realmente excluir este registro do histórico?')) {
            return;
        }

        this.registros = this.registros.filter(r => r.id !== id);
        this.save();
        this.render();
        App.showToast('Registro excluído!', 'success');
    },

    render() {
        const searchTerm = this.searchInput.value.toLowerCase();

        let filtered = this.registros;

        if (searchTerm) {
            filtered = filtered.filter(r =>
                r.nome.toLowerCase().includes(searchTerm) ||
                r.armazem.toLowerCase().includes(searchTerm) ||
                r.ordens.some(op => op.toLowerCase().includes(searchTerm))
            );
        }

        if (filtered.length === 0) {
            this.cardsContainer.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.cardsContainer.innerHTML = filtered.map(registro => `
            <div class="list-card completed" onclick="Historico.verDetalhes(${registro.id})">
                <div class="list-card-header">
                    <span class="list-card-title">${registro.nome}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="list-card-badge completed">Finalizado</span>
                        ${Auth.isAdmin() ? `<button class="btn-delete-item" onclick="event.stopPropagation(); Historico.deletarRegistro(${registro.id})" title="Excluir registro">✕</button>` : ''}
                    </div>
                </div>
                <div class="list-card-info">
                    <span><strong>Armazém:</strong> ${registro.armazem}</span>
                    <span><strong>Conferido por:</strong> ${registro.responsavelConferencia || 'N/A'}</span>
                    <span><strong>Resultado:</strong> ${registro.itensOK}/${registro.totalItens} OK</span>
                </div>
                <div class="list-card-footer">
                    <span class="list-card-date">${registro.dataFinalizacao}</span>
                    <span class="list-card-count">${registro.totalItens} itens</span>
                </div>
            </div>
        `).join('');
    }
};
