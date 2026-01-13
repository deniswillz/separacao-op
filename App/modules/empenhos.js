/**
 * Empenhos Module
 * New flow: Import → Select OPs → Show as Pending
 */

const Empenhos = {
    data: [],                   // All imported items
    opsList: [],                // Unique OPs with metadata
    selectedOPs: new Set(),     // OPs selected for separation

    tableBody: null,
    emptyState: null,

    init() {
        this.tableBody = document.querySelector('#tableOPsPendentes tbody');
        this.emptyState = document.getElementById('emptyOPsPendentes');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.EMPENHOS);
        if (saved) {
            this.data = saved.data || [];
            this.opsList = saved.opsList || [];
            this.selectedOPs = new Set(saved.selectedOPs || []);
        }

        // Setup event listeners
        document.getElementById('importEmpenhos').addEventListener('change', (e) => {
            this.importExcel(e.target.files[0]);
        });

        const btnModelo = document.getElementById('btnModeloEmpenhos');
        if (btnModelo) {
            btnModelo.addEventListener('click', () => {
                this.downloadTemplate();
            });
        }

        document.getElementById('btnGerarSeparacao').addEventListener('click', () => {
            this.gerarSeparacao();
        });

        const btnLimpar = document.getElementById('btnLimparEmpenhos');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                this.limparTudo();
            });
        }

        this.renderOPSelector();
        this.renderPendentes();
    },

    downloadTemplate() {
        const templateData = [
            { 'Ord_Producao': 'OP001', 'Data': '01/01/2026', 'Codigo': 'PROD001', 'Descricao': 'Produto 1', 'Quantidade': 10, 'Unidade': 'UN' },
            { 'Ord_Producao': 'OP001', 'Data': '01/01/2026', 'Codigo': 'PROD002', 'Descricao': 'Produto 2', 'Quantidade': 5, 'Unidade': 'PC' },
            { 'Ord_Producao': 'OP002', 'Data': '02/01/2026', 'Codigo': 'PROD003', 'Descricao': 'Produto 3', 'Quantidade': 20, 'Unidade': 'UN' }
        ];

        ExcelHelper.exportToExcel(templateData, 'Modelo_Ordens');
        App.showToast('Modelo Excel baixado!', 'success');
    },

    limparTudo() {
        if (!confirm('Deseja realmente limpar todas as ordens importadas?')) {
            return;
        }

        this.data = [];
        this.opsList = [];
        this.selectedOPs.clear();
        this.save();
        this.renderOPSelector();
        this.renderPendentes();
        App.showToast('Ordens limpas com sucesso!', 'success');
    },

    async importExcel(file) {
        if (!file) return;

        try {
            const rawData = await ExcelHelper.readFileWithHeaders(file);

            const newData = rawData.map((row, index) => {
                // MAPEAMENTO DE COLUNAS (Nomes reais do Excel):
                // Coluna A: 'Ordem Producao'
                // Coluna U: 'Codigo'
                // Coluna V: 'Descricao_1' (tem _1 porque há outra coluna Descricao)
                // Coluna W: 'Quantidade_1' (tem _1 porque há outra coluna Quantidade)
                // Coluna X: 'UM'

                const op = row['Ordem Producao'] || '';
                const codigo = row['Codigo'] || '';

                return {
                    id: this.data.length + Date.now() + index,
                    op: String(op).trim(),
                    data: row.Data || row.Emissao || new Date().toLocaleDateString('pt-BR'),
                    codigo: String(codigo).toUpperCase().trim(),
                    descricao: row['Descricao_1'] || row['Descricao'] || '',
                    quantidade: parseFloat(row['Quantidade_1'] || 0) || 0,
                    unidade: row['UM'] || 'UN'
                };
            });

            this.data = [...this.data, ...newData];

            // Build OPs list
            this.buildOPsList();

            this.save();
            this.renderOPSelector();
            this.renderPendentes();

            App.showToast(`${newData.length} itens importados com sucesso!`, 'success');
        } catch (error) {
            console.error(error);
            App.showToast('Erro ao importar arquivo', 'error');
        }

        document.getElementById('importEmpenhos').value = '';
    },

    buildOPsList() {
        const opsMap = {};

        this.data.forEach(item => {
            if (!item.op) return;

            if (!opsMap[item.op]) {
                opsMap[item.op] = {
                    op: item.op,
                    data: item.data || new Date().toLocaleDateString('pt-BR'),
                    itensCount: 0,
                    isSelected: this.selectedOPs.has(item.op)
                };
            }
            opsMap[item.op].itensCount++;
        });

        this.opsList = Object.values(opsMap).sort((a, b) => a.op.localeCompare(b.op));
    },

    save() {
        Storage.save(Storage.KEYS.EMPENHOS, {
            data: this.data,
            opsList: this.opsList,
            selectedOPs: Array.from(this.selectedOPs)
        });
    },

    selectOP(op) {
        // Add to selected list
        if (!this.selectedOPs.has(op)) {
            this.selectedOPs.add(op);
            this.save();
            this.renderOPSelector();
            this.renderPendentes();
        }
    },

    removeOP(op) {
        this.selectedOPs.delete(op);
        this.save();
        this.renderOPSelector();
        this.renderPendentes();
    },

    renderOPSelector() {
        const container = document.getElementById('opSelector');

        // Filter out already selected OPs
        const availableOPs = this.opsList.filter(op => !this.selectedOPs.has(op.op));

        if (this.opsList.length === 0) {
            container.innerHTML = '<span class="empty-text">Importe ordens para selecionar</span>';
            return;
        }

        if (availableOPs.length === 0) {
            container.innerHTML = '<span class="empty-text">Todas as OPs já foram selecionadas</span>';
            return;
        }

        container.innerHTML = availableOPs.map(op => `
            <label class="op-checkbox" onclick="Empenhos.selectOP('${op.op}')">
                ${op.op} <span style="font-size: 0.75rem; color: var(--gray-500);">(${op.data})</span>
            </label>
        `).join('');
    },

    renderPendentes() {
        const selectedList = this.opsList.filter(op => this.selectedOPs.has(op.op));

        if (selectedList.length === 0) {
            this.tableBody.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.tableBody.innerHTML = selectedList.map(op => `
            <tr>
                <td><strong>${op.op}</strong></td>
                <td>${op.data}</td>
                <td>${op.itensCount}</td>
                <td><span class="status-badge pending">Pendente</span></td>
                <td>
                    <button class="btn-delete" onclick="Empenhos.removeOP('${op.op}')">
                        🗑️ Remover
                    </button>
                </td>
            </tr>
        `).join('');
    },

    gerarSeparacao() {
        if (this.selectedOPs.size === 0) {
            App.showToast('Selecione pelo menos uma OP', 'warning');
            return;
        }

        const armazem = document.getElementById('armazemDestino').value;

        if (!armazem) {
            App.showToast('Selecione o armazém de destino', 'warning');
            document.getElementById('armazemDestino').focus();
            return;
        }

        // Get items from selected OPs
        const selectedData = this.data.filter(item => this.selectedOPs.has(item.op));

        if (selectedData.length === 0) {
            App.showToast('Nenhum item nas OPs selecionadas', 'warning');
            return;
        }

        // Get unique OPs sorted
        const ordens = [...this.selectedOPs].sort();

        // Group items by product code for SEPARAÇÃO (sum quantities)
        // But keep details of quantity per OP for CONFERÊNCIA
        const agrupado = {};
        selectedData.forEach(item => {
            const key = item.codigo;
            if (!agrupado[key]) {
                agrupado[key] = {
                    codigo: item.codigo,
                    descricao: item.descricao,
                    unidade: item.unidade,
                    quantidade: 0,
                    qtdSeparada: 0,
                    ordens: new Set(),
                    // Store quantity per OP for Conferência
                    qtdPorOP: {}
                };
            }
            agrupado[key].quantidade += item.quantidade;
            if (item.op) {
                agrupado[key].ordens.add(item.op);
                // Track quantity per OP
                if (!agrupado[key].qtdPorOP[item.op]) {
                    agrupado[key].qtdPorOP[item.op] = 0;
                }
                agrupado[key].qtdPorOP[item.op] += item.quantidade;
            }
        });

        // Convert to array - items are grouped for Separação
        const separacaoData = Object.values(agrupado).map((item, index) => ({
            id: index + 1,
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade, // Total sum
            qtdSeparada: 0,
            ordens: Array.from(item.ordens), // All OPs this item belongs to
            qtdPorOP: item.qtdPorOP, // Quantity breakdown by OP
            separado: false,
            transferido: false,
            naoSeparado: false,
            observacao: ''
        }));

        // Create list name
        const listName = `OP ${ordens[0]}${ordens.length > 1 ? ' - ' + ordens[ordens.length - 1] : ''}`;

        // Send to Separação module
        Separacao.criarLista({
            id: Date.now(),
            nome: listName,
            armazem: armazem,
            ordens: ordens,
            itens: separacaoData,
            status: 'pendente',
            dataCriacao: new Date().toLocaleString('pt-BR'),
            documento: '',
            responsavel: ''
        });

        // Clear selection
        this.selectedOPs.clear();
        this.save();
        this.renderOPSelector();
        this.renderPendentes();

        // Navigate to Separação tab
        App.switchTab('separacao');
        App.showToast(`Lista "${listName}" criada com ${separacaoData.length} itens`, 'success');
    }
};
