/**
 * Empenhos Module
 * New flow: Import → Select OPs → Show as Pending
 */

const Empenhos = {
    data: [],                   // All imported items
    opsList: [],                // Unique OPs with metadata
    selectedOPs: {},            // OPs selected for separation: { op: urgencyLevel }

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
            this.selectedOPs = saved.selectedOPs || {};
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

        // Register realtime callback
        if (typeof SupabaseClient !== 'undefined') {
            SupabaseClient.onRealtimeUpdate('empenhos', (payload) => {
                console.log('🔄 Empenhos: recebida atualização remota');
                this.reload();
            });
        }
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
            // Use readFile to get raw array data (access by index)
            const rawData = await ExcelHelper.readFile(file);

            // Skip header row (index 0)
            const dataRows = rawData.slice(1);

            const existingOPCodes = new Set(this.data.map(item => `${item.op}|${item.codigo}`));
            let duplicatesSkipped = 0;

            const newData = dataRows.map((row, index) => {
                const op = String(row[0] || '').trim();
                const codigo = String(row[20] || '').toUpperCase().trim();

                if (!op || !codigo) return null;

                const opCodeKey = `${op}|${codigo}`;
                if (existingOPCodes.has(opCodeKey)) {
                    duplicatesSkipped++;
                    return null;
                }
                existingOPCodes.add(opCodeKey);

                const descricao = String(row[21] || '').trim();
                const quantidade = parseFloat(row[22]) || 0;
                const unidade = String(row[23] || 'UN').toUpperCase().trim();

                const paProduto = String(row[1] || '').trim();
                const paDescricao = String(row[2] || '').trim();
                const paQtdProd = parseFloat(row[7]) || 0;

                return {
                    // Unique ID based on OP and Code to prevent technical duplicates
                    id: Storage.generateUUID(),
                    op,
                    data: new Date().toLocaleDateString('pt-BR'),
                    codigo,
                    descricao,
                    quantidade,
                    unidade,
                    pa: {
                        produto: paProduto,
                        descricao: paDescricao,
                        quantidade: paQtdProd
                    }
                };
            }).filter(item => item !== null);

            if (newData.length > 0) {
                this.data = [...this.data, ...newData];
                this.buildOPsList();
                this.save();
                this.renderOPSelector();
                this.renderPendentes();

                let msg = `${newData.length} itens importados!`;
                if (duplicatesSkipped > 0) msg += ` (${duplicatesSkipped} duplicados ignorados)`;
                App.showToast(msg, 'success');
            } else {
                App.showToast(duplicatesSkipped > 0 ? 'Todos os itens já foram importados anteriormente.' : 'Nenhum item válido encontrado no arquivo.', 'warning');
            }
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
                    isSelected: !!this.selectedOPs[item.op]
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
            selectedOPs: this.selectedOPs
        });
    },

    /**
     * Reload data from cloud and refresh UI
     */
    async reload() {
        const cloudData = await Storage.loadFromCloud(Storage.KEYS.EMPENHOS);
        if (cloudData) {
            this.data = cloudData.data || [];
            this.opsList = cloudData.opsList || [];
            this.selectedOPs = cloudData.selectedOPs || {};
            this.renderOPSelector();
            this.renderPendentes();
            // Also update Dashboard
            if (typeof Dashboard !== 'undefined') Dashboard.render();
        }
    },

    selectOP(op) {
        // Add to selected list
        if (!this.selectedOPs[op]) {
            this.selectedOPs[op] = 'media';
            this.save();
            this.renderOPSelector();
            this.renderPendentes();
        }
    },

    updateUrgency(op, level) {
        if (this.selectedOPs[op]) {
            this.selectedOPs[op] = level;
            this.save();
        }
    },

    removeOP(op) {
        delete this.selectedOPs[op];
        this.save();
        this.renderOPSelector();
        this.renderPendentes();
    },

    renderOPSelector() {
        const container = document.getElementById('opSelector');

        // Filter out already selected OPs
        const availableOPs = this.opsList.filter(op => !this.selectedOPs[op.op]);

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
        const selectedList = this.opsList.filter(op => !!this.selectedOPs[op.op]);

        if (selectedList.length === 0) {
            this.tableBody.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.tableBody.innerHTML = selectedList.map(op => {
            const urgency = this.selectedOPs[op.op] || 'media';
            return `
                <tr>
                    <td><strong>${op.op}</strong></td>
                    <td>${op.data}</td>
                    <td>${op.itensCount}</td>
                    <td>
                        <select class="urgency-select" onchange="Empenhos.updateUrgency('${op.op}', this.value)">
                            <option value="baixa" ${urgency === 'baixa' ? 'selected' : ''}>🔵 Baixa</option>
                            <option value="media" ${urgency === 'media' ? 'selected' : ''}>🟡 Média</option>
                            <option value="alta" ${urgency === 'alta' ? 'selected' : ''}>🔴 Alta</option>
                            <option value="urgencia" ${urgency === 'urgencia' ? 'selected' : ''}>🔥 Urgência</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn-delete" onclick="Empenhos.removeOP('${op.op}')">
                            🗑️ Remover
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    gerarSeparacao() {
        const selectedOPNames = Object.keys(this.selectedOPs);
        if (selectedOPNames.length === 0) {
            App.showToast('Selecione pelo menos uma OP', 'warning');
            return;
        }

        const armazem = document.getElementById('armazemDestino').value;

        if (!armazem) {
            App.showToast('Selecione o armazém de destino', 'warning');
            document.getElementById('armazemDestino').focus();
            return;
        }

        // Get unique OPs sorted
        const ordens = selectedOPNames.sort();

        // VERIFICAR DUPLICIDADE: Checar se alguma OP já existe em Separação, Conferência ou Histórico
        const opsEmSeparacao = (Separacao.listas || []).flatMap(l => l.ordens || []);
        const opsEmConferencia = (Conferencia.listas || []).flatMap(l => l.ordens || []);
        const opsEmHistorico = (Historico.registros || []).flatMap(l => l.ordens || []);

        const opsDuplicadas = ordens.filter(op =>
            opsEmSeparacao.includes(op) ||
            opsEmConferencia.includes(op) ||
            opsEmHistorico.includes(op)
        );

        if (opsDuplicadas.length > 0) {
            // Identificar onde cada OP duplicada está com ícones
            // PRIORIDADE: Histórico > Conferência > Separação (verificar estágios mais avançados primeiro)
            const listaDetalhes = opsDuplicadas.map(op => {
                let modulo = '';
                let icone = '';
                if (opsEmHistorico.includes(op)) {
                    modulo = 'Histórico';
                    icone = '📚';
                } else if (opsEmConferencia.includes(op)) {
                    modulo = 'Conferência';
                    icone = '🔍';
                } else if (opsEmSeparacao.includes(op)) {
                    modulo = 'Separação';
                    icone = '✅';
                }
                return `<li><strong>${op}</strong> - ${icone} ${modulo}</li>`;
            }).join('');

            const body = `
                <div style="text-align: center; padding: 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                    <h3 style="color: #dc3545; margin-bottom: 1rem;">OPs Já Processadas!</h3>
                    <p style="margin-bottom: 1rem;">As seguintes Ordens de Produção já estão em processo:</p>
                    <ul style="text-align: left; margin: 1rem 2rem; list-style: none; padding: 0;">
                        ${listaDetalhes}
                    </ul>
                    <p style="color: #dc3545; font-weight: bold;">Remova estas OPs da seleção para continuar.</p>
                </div>
            `;

            const footer = `
                <button class="btn btn-primary" onclick="App.closeModal()">Entendi</button>
            `;

            App.showModal('OPs Duplicadas', body, footer);
            return;
        }

        // Get items from selected OPs
        const selectedData = this.data.filter(item => !!this.selectedOPs[item.op]);

        if (selectedData.length === 0) {
            App.showToast('Nenhum item nas OPs selecionadas', 'warning');
            return;
        }

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

        // Determine list urgency (highest priority among selected OPs)
        const priorityOrder = { 'baixa': 0, 'media': 1, 'alta': 2, 'urgencia': 3 };
        let maxUrgency = 'baixa';
        ordens.forEach(op => {
            if (priorityOrder[this.selectedOPs[op]] > priorityOrder[maxUrgency]) {
                maxUrgency = this.selectedOPs[op];
            }
        });

        // NOVO: Gerar registros para Matriz x Filial (Produtos Acabados)
        const paRecords = [];
        const processedOPs = new Set();
        selectedData.forEach(item => {
            if (!processedOPs.has(item.op) && item.pa && item.pa.produto) {
                paRecords.push({
                    op: item.op,
                    produto: item.pa.produto,
                    descricao: item.pa.descricao,
                    quantidade: item.pa.quantidade
                });
                processedOPs.add(item.op);
            }
        });

        if (paRecords.length > 0) {
            MatrizFilial.addRecords(paRecords);
        }

        // Send to Separação module
        Separacao.criarLista({
            id: Storage.generateUUID(),
            nome: listName,
            armazem: armazem,
            ordens: ordens,
            itens: separacaoData,
            status: 'pendente',
            urgencia: maxUrgency,
            dataCriacao: new Date().toISOString(),
            documento: '',
            responsavel: ''
        });

        // Clear selection
        this.selectedOPs = {};
        this.save();
        this.renderOPSelector();
        this.renderPendentes();

        // Navigate to Separação tab
        App.switchTab('separacao');
        App.showToast(`Lista "${listName}" criada com ${separacaoData.length} itens`, 'success');
    }
};
