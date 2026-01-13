/**
 * Conferência Module
 * - FALTA checkbox with urgency alert
 * - Blacklist items not counted in total
 */

const Conferencia = {
    listas: [],
    listaAtual: null,
    filtroOP: '',

    listView: null,
    detailView: null,
    cardsContainer: null,
    emptyState: null,
    tableBody: null,

    init() {
        this.listView = document.getElementById('conferenciaListView');
        this.detailView = document.getElementById('conferenciaDetailView');
        this.cardsContainer = document.getElementById('conferenciaListas');
        this.emptyState = document.getElementById('emptyConferenciaListas');
        this.tableBody = document.querySelector('#tableConferencia tbody');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.CONFERENCIA);
        if (saved) {
            this.listas = saved;
        }

        // Setup event listeners
        const btnVoltar = document.getElementById('btnVoltarConferencia');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                this.voltarParaLista();
            });
        }

        const btnSalvar = document.getElementById('btnSalvarPendente');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                this.salvarComPendencias();
            });
        }

        const btnFinalizar = document.getElementById('btnFinalizarConferencia');
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', () => {
                this.finalizarConferencia();
            });
        }

        const responsavelInput = document.getElementById('responsavelConferencia');
        if (responsavelInput) {
            responsavelInput.addEventListener('change', () => {
                this.saveInfo();
            });
        }

        const filtroOP = document.getElementById('filtroOPConferencia');
        if (filtroOP) {
            filtroOP.addEventListener('change', (e) => {
                this.filtroOP = e.target.value;
                this.renderItens();
                this.updateStats();
            });
        }

        this.renderListas();
    },

    receberLista(listaSeparacao) {
        const blacklistCodes = Blacklist.getBlacklistedCodes();

        // Filter out blacklist items when receiving
        const itensValidos = listaSeparacao.itens.filter(item =>
            !blacklistCodes.includes(item.codigo) && !item.naoSeparado
        );

        // Expand grouped items into individual items per OP for Conferência
        // This allows checking each OP separately with correct quantities
        const itensExpandidos = [];
        let itemId = 1;

        itensValidos.forEach(item => {
            // If item has qtdPorOP, create separate items for each OP
            if (item.qtdPorOP && Object.keys(item.qtdPorOP).length > 0) {
                Object.entries(item.qtdPorOP).forEach(([op, qtd]) => {
                    itensExpandidos.push({
                        id: itemId++,
                        codigo: item.codigo,
                        descricao: item.descricao,
                        quantidade: qtd, // Quantity for this specific OP
                        qtdSeparada: item.qtdSeparada || 0, // Use total separated
                        ordens: [op], // Single OP for this item
                        ok: false,
                        falta: false,
                        observacao: ''
                    });
                });
            } else {
                // Fallback: item doesn't have qtdPorOP (old data)
                itensExpandidos.push({
                    id: itemId++,
                    codigo: item.codigo,
                    descricao: item.descricao,
                    quantidade: item.quantidade,
                    qtdSeparada: item.qtdSeparada || 0,
                    ordens: item.ordens || [],
                    ok: false,
                    falta: false,
                    observacao: ''
                });
            }
        });

        const conferencia = {
            id: Date.now(),
            separacaoId: listaSeparacao.id,
            nome: listaSeparacao.nome,
            armazem: listaSeparacao.armazem,
            ordens: listaSeparacao.ordens,
            documento: listaSeparacao.documento,
            responsavelSeparacao: listaSeparacao.responsavel,
            responsavelConferencia: '',
            dataConferencia: new Date().toLocaleString('pt-BR'),
            status: 'pendente',
            ordensConferidas: [],
            itens: itensExpandidos
        };

        this.listas.push(conferencia);
        this.save();
        this.renderListas();
    },

    save() {
        Storage.save(Storage.KEYS.CONFERENCIA, this.listas);
    },

    saveInfo() {
        if (!this.listaAtual) return;

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.responsavelConferencia = document.getElementById('responsavelConferencia').value;
            this.save();
        }
    },

    abrirLista(id) {
        const lista = this.listas.find(l => l.id === id);
        if (!lista) return;

        this.listaAtual = lista;
        this.filtroOP = '';

        document.getElementById('conferenciaListaTitulo').textContent = lista.nome;
        document.getElementById('conferenciaListaInfo').textContent =
            `Armazém: ${lista.armazem} | Separação: ${lista.responsavelSeparacao || 'N/A'}`;

        // Auto-fill responsável with current user name if empty
        const responsavel = lista.responsavelConferencia || Auth.currentUser?.nome || '';
        document.getElementById('responsavelConferencia').value = responsavel;
        if (!lista.responsavelConferencia && Auth.currentUser?.nome) {
            lista.responsavelConferencia = Auth.currentUser.nome;
            this.save();
        }

        document.getElementById('dataConferencia').value = lista.dataConferencia;

        this.populateOPFilter();
        this.renderOrdens();

        this.listView.style.display = 'none';
        this.detailView.style.display = 'block';

        this.renderItens();
        this.updateStats();
    },

    populateOPFilter() {
        const select = document.getElementById('filtroOPConferencia');
        if (!this.listaAtual) return;

        select.innerHTML = '<option value="">Todas as OPs</option>';

        this.listaAtual.ordens.forEach(op => {
            const isConferida = this.listaAtual.ordensConferidas?.includes(op);
            const status = isConferida ? ' ✅' : '';
            select.innerHTML += `<option value="${op}">${op}${status}</option>`;
        });
    },

    voltarParaLista() {
        this.listaAtual = null;
        this.filtroOP = '';
        this.detailView.style.display = 'none';
        this.listView.style.display = 'block';
        this.renderListas();
    },

    excluirLista(id) {
        if (!confirm('Deseja realmente excluir esta lista de conferência?')) {
            return;
        }

        this.listas = this.listas.filter(l => l.id !== id);
        this.save();
        this.renderListas();
        Dashboard.render();
        App.showToast('Lista de conferência excluída!', 'success');
    },

    renderOrdens() {
        const container = document.getElementById('ordensConferencia');

        if (!this.listaAtual || this.listaAtual.ordens.length === 0) {
            container.innerHTML = '<span class="empty-orders">Nenhuma ordem</span>';
            return;
        }

        container.innerHTML = this.listaAtual.ordens.map(op => {
            const isConferida = this.listaAtual.ordensConferidas?.includes(op);
            const badgeClass = isConferida ? 'order-tag completed' : 'order-tag';
            const icon = isConferida ? '✅' : '⏳';
            return `<span class="${badgeClass}" onclick="Conferencia.filtrarPorOP('${op}')">${icon} OP ${op}</span>`;
        }).join('');
    },

    filtrarPorOP(op) {
        this.filtroOP = op;
        document.getElementById('filtroOPConferencia').value = op;
        this.renderItens();
        this.updateStats();
    },

    marcarOPComoConferida(op) {
        if (!this.listaAtual) return;

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (!lista) return;

        if (!lista.ordensConferidas) {
            lista.ordensConferidas = [];
        }

        if (!lista.ordensConferidas.includes(op)) {
            lista.ordensConferidas.push(op);
        }

        this.listaAtual = lista;
        this.save();
        this.renderOrdens();
        this.populateOPFilter();
    },

    updateItem(itemId, field, value) {
        if (!this.listaAtual) return;

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (!lista) return;

        const item = lista.itens.find(i => i.id === itemId);
        if (item) {
            item[field] = value;

            // If marking as OK, uncheck FALTA
            if (field === 'ok' && value) {
                item.falta = false;
            }

            // If marking as FALTA, uncheck OK
            if (field === 'falta' && value) {
                item.ok = false;
            }

            this.listaAtual = lista;
            this.save();
            this.updateStats();
            this.renderItens();

            // Check if all items from current OP are OK
            if (field === 'ok' && value && this.filtroOP) {
                const itensOP = lista.itens.filter(i => i.ordens.includes(this.filtroOP));
                const todosOK = itensOP.every(i => i.ok);
                if (todosOK) {
                    this.marcarOPComoConferida(this.filtroOP);
                    App.showToast(`OP ${this.filtroOP} totalmente conferida!`, 'success');
                }
            }
        }
    },

    updateStats() {
        if (!this.listaAtual) return;

        let itens = this.listaAtual.itens;

        // Filter by OP if selected
        if (this.filtroOP) {
            itens = itens.filter(i => i.ordens.includes(this.filtroOP));
        }

        const total = itens.length;
        const conferidos = itens.filter(i => i.ok).length;
        const faltando = itens.filter(i => i.falta).length;
        const pendentes = total - conferidos - faltando;

        document.getElementById('totalConferir').textContent = total;
        document.getElementById('totalConferidos').textContent = conferidos;
        document.getElementById('totalPendentes').textContent = pendentes;
        document.getElementById('totalFaltando').textContent = faltando;
    },

    getItensFaltando() {
        const faltando = [];

        this.listas.filter(l => l.status === 'pendente').forEach(lista => {
            const itensFalta = lista.itens.filter(i => i.falta);
            if (itensFalta.length > 0) {
                faltando.push({
                    lista: lista.nome,
                    armazem: lista.armazem,
                    ordens: lista.ordens,
                    itens: itensFalta
                });
            }
        });

        return faltando;
    },

    salvarComPendencias() {
        if (!this.listaAtual) return;

        const responsavel = document.getElementById('responsavelConferencia').value;
        if (!responsavel) {
            App.showToast('Informe o responsável pela conferência', 'warning');
            document.getElementById('responsavelConferencia').focus();
            return;
        }

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.status = 'pendente';
            lista.responsavelConferencia = responsavel;
            this.save();
        }

        this.voltarParaLista();
        App.showToast('Conferência salva com pendências', 'success');
    },

    finalizarConferencia() {
        if (!this.listaAtual) return;

        const responsavel = document.getElementById('responsavelConferencia').value;

        if (!responsavel) {
            App.showToast('Informe o responsável pela conferência', 'warning');
            document.getElementById('responsavelConferencia').focus();
            return;
        }

        // Check for items with FALTA
        const itensFalta = this.listaAtual.itens.filter(i => i.falta);
        if (itensFalta.length > 0) {
            if (!confirm(`Existem ${itensFalta.length} itens com FALTA. Deseja finalizar mesmo assim?`)) {
                return;
            }
        }

        // Check if all OPs are conferidas
        const todasOPsConferidas = this.listaAtual.ordens.every(op =>
            this.listaAtual.ordensConferidas?.includes(op)
        );

        if (!todasOPsConferidas) {
            const opsNaoConferidas = this.listaAtual.ordens.filter(op =>
                !this.listaAtual.ordensConferidas?.includes(op)
            );

            if (!confirm(`As seguintes OPs ainda não foram conferidas: ${opsNaoConferidas.join(', ')}. Deseja finalizar mesmo assim?`)) {
                return;
            }
        }

        // Update lista status
        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.status = 'finalizado';
            lista.responsavelConferencia = responsavel;
            lista.dataFinalizacao = new Date().toLocaleString('pt-BR');
            this.save();
        }

        // Send to Histórico
        Historico.adicionarRegistro(lista);

        // Remove from conferencia list
        this.listas = this.listas.filter(l => l.id !== this.listaAtual.id);
        this.save();

        this.voltarParaLista();
        App.showToast('Conferência finalizada com sucesso!', 'success');
    },

    exportarExcel(lista) {
        const exportData = lista.itens.map(item => ({
            'Código': item.codigo,
            'Descrição': item.descricao,
            'Qtd Solicitada': item.quantidade,
            'Qtd Separada': item.qtdSeparada || 0,
            'Conferido': item.ok ? 'OK' : (item.falta ? 'FALTA' : 'Pendente'),
            'Observação': item.observacao || ''
        }));

        ExcelHelper.exportToExcel(exportData, `Conferencia_${lista.nome.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}`);
    },

    renderListas() {
        const listasPendentes = this.listas.filter(l => l.status === 'pendente');

        if (listasPendentes.length === 0) {
            this.cardsContainer.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.cardsContainer.innerHTML = listasPendentes.map(lista => {
            const conferidos = lista.itens.filter(i => i.ok).length;
            const faltando = lista.itens.filter(i => i.falta).length;
            const total = lista.itens.length;
            const opsConferidas = lista.ordensConferidas?.length || 0;
            const opsTotal = lista.ordens.length;
            const hasFalta = faltando > 0;

            return `
                <div class="list-card ${hasFalta ? 'urgent' : 'pending'}" onclick="Conferencia.abrirLista(${lista.id})">
                    <div class="list-card-header">
                        <span class="list-card-title">${lista.nome}</span>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span class="list-card-badge ${hasFalta ? 'danger' : 'pending'}">${hasFalta ? '🚨 URGENTE' : 'Pendente'}</span>
                            ${Auth.isAdmin() ? `<button class="btn-delete-item" onclick="event.stopPropagation(); Conferencia.excluirLista(${lista.id})" title="Excluir lista">✕</button>` : ''}
                        </div>
                    </div>
                    <div class="list-card-info">
                        <span><strong>Armazém:</strong> ${lista.armazem}</span>
                        <span><strong>Doc:</strong> ${lista.documento || 'N/A'}</span>
                        <span><strong>OPs:</strong> ${opsConferidas}/${opsTotal} conferidas</span>
                        <span><strong>Itens:</strong> ${conferidos}/${total} OK ${faltando > 0 ? `| <span style="color:#DC2626">${faltando} FALTA</span>` : ''}</span>
                    </div>
                    <div class="list-card-footer">
                        <span class="list-card-date">${lista.dataConferencia}</span>
                        <span class="list-card-count">${total} itens</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderItens() {
        if (!this.listaAtual) {
            this.tableBody.innerHTML = '';
            return;
        }

        let itens = this.listaAtual.itens;

        // Filter by OP if selected
        if (this.filtroOP) {
            itens = itens.filter(i => i.ordens.includes(this.filtroOP));
        }

        if (itens.length === 0) {
            this.tableBody.innerHTML = '';
            document.getElementById('emptyConferencia').classList.add('show');
            return;
        }

        document.getElementById('emptyConferencia').classList.remove('show');

        this.tableBody.innerHTML = itens.map(item => {
            const rowClass = item.falta ? 'has-falta' : '';

            // Lookup description from Cadastro (prioritize Cadastro, fallback to imported)
            const descricaoCadastro = Cadastro.getDescricao(item.codigo);
            const descricao = descricaoCadastro || item.descricao || '-';

            // Lookup address and armazem from Endereços
            const enderecoInfo = Enderecos.getEnderecoInfo(item.codigo);
            const endereco = enderecoInfo ? enderecoInfo.endereco : '-';
            const armazemEnd = enderecoInfo ? enderecoInfo.armazem : '';
            const armazemDisplay = armazemEnd ? ` | 🏭 ${armazemEnd}` : '';

            return `
            <tr class="${rowClass}">
                <td>${item.codigo}</td>
                <td>
                    <div>${descricao}</div>
                    <small class="endereco-info">📍 ${endereco}${armazemDisplay}</small>
                </td>
                <td class="center">${item.quantidade.toLocaleString('pt-BR')}</td>
                <td class="center">${(item.qtdSeparada || 0).toLocaleString('pt-BR')}</td>
                <td class="center">
                    <input type="checkbox" 
                           ${item.ok ? 'checked' : ''} 
                           onchange="Conferencia.updateItem(${item.id}, 'ok', this.checked)">
                </td>
                <td class="center">
                    <input type="checkbox" class="falta-checkbox"
                           ${item.falta ? 'checked' : ''} 
                           onchange="Conferencia.updateItem(${item.id}, 'falta', this.checked)">
                </td>
                <td>
                    <input type="text" 
                           value="${item.observacao || ''}" 
                           placeholder="Observação..."
                           onchange="Conferencia.updateItem(${item.id}, 'observacao', this.value)">
                </td>
            </tr>
        `}).join('');
    }
};
