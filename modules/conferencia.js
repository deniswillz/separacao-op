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

        const btnListaTransferencia = document.getElementById('btnListaTransferencia');
        if (btnListaTransferencia) {
            btnListaTransferencia.addEventListener('click', () => {
                this.mostrarListaTransferencia();
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

        // Register realtime callback
        SupabaseClient.onRealtimeUpdate('conferencia', (payload) => {
            console.log('🔄 Conferencia: recebida atualização remota');
            this.reload();
        });

        this.renderListas();
    },

    /**
     * Reload data from cloud and refresh UI
     */
    async reload() {
        const cloudData = await Storage.loadFromCloud(Storage.KEYS.CONFERENCIA);
        // Só atualiza se recebeu dados válidos (array, não null)
        // null indica que a cloud estava vazia ou sincronizando
        if (Array.isArray(cloudData)) {
            this.listas = cloudData;
            this.renderListas();
            // If viewing a specific list, refresh it too
            if (this.listaAtual) {
                const updatedLista = this.listas.find(l => String(l.id) === String(this.listaAtual.id));
                if (updatedLista) {
                    this.listaAtual = updatedLista;
                    this.renderItens();
                    this.updateStats();
                    this.renderOrdens();
                }
            }
            // Also update Dashboard
            Dashboard.render();
        }
    },

    receberLista(listaSeparacao) {
        const blacklistCodes = Blacklist.getBlacklistedCodes();

        // Filter out blacklist items when receiving
        const itensValidos = listaSeparacao.itens.filter(item =>
            !blacklistCodes.includes(item.codigo) && !item.naoSeparado
        );

        // Expand grouped items into individual items per OP for Conferência
        // Now using separadoPorOP (from Lupa) instead of original qtdPorOP
        const itensExpandidos = [];
        let itemId = 1;

        itensValidos.forEach(item => {
            // Use separadoPorOP if available (new flow), fallback to qtdPorOP (old flow)
            const separadoPorOP = item.separadoPorOP || {};
            const qtdPorOP = item.qtdPorOP || {};

            // Get all OPs from both sources
            const opsFromSeparado = Object.keys(separadoPorOP);
            const opsFromOriginal = Object.keys(qtdPorOP);
            const allOPs = [...new Set([...opsFromSeparado, ...opsFromOriginal])];

            if (allOPs.length > 0) {
                allOPs.forEach(op => {
                    // Get ORIGINAL quantity from order (qtdPorOP)
                    const qtdSolicitada = qtdPorOP[op] || 0;

                    // Get SEPARATED quantity from Lupa (separadoPorOP)
                    const sepInfo = separadoPorOP[op];
                    let qtdSeparada = 0;

                    if (sepInfo && sepInfo.ok) {
                        // If this OP was marked OK in Lupa, use the separated quantity
                        qtdSeparada = sepInfo.qtdSeparada || 0;
                    } else if (sepInfo) {
                        // Has separadoPorOP but not marked OK - use what was entered
                        qtdSeparada = sepInfo.qtdSeparada || 0;
                    } else {
                        // Fallback: old data without separadoPorOP - use original
                        qtdSeparada = qtdSolicitada;
                    }

                    // Only add if there's quantity to check (either original or separated)
                    if (qtdSolicitada > 0 || qtdSeparada > 0) {
                        itensExpandidos.push({
                            id: itemId++,
                            codigo: item.codigo,
                            descricao: item.descricao,
                            quantidade: qtdSolicitada, // ORIGINAL from order
                            qtdSeparada: qtdSeparada, // From Lupa
                            ordens: [op],
                            ok: false,
                            falta: false,
                            observacao: ''
                        });
                    }
                });
            } else {
                // Fallback: item doesn't have qtdPorOP (old data)
                itensExpandidos.push({
                    id: itemId++,
                    codigo: item.codigo,
                    descricao: item.descricao,
                    quantidade: item.qtdSeparada || item.quantidade,
                    qtdSeparada: item.qtdSeparada || 0,
                    ordens: item.ordens || [],
                    ok: false,
                    falta: false,
                    observacao: ''
                });
            }
        });

        const conferencia = {
            id: Storage.generateUUID(),
            separacaoId: listaSeparacao.id,
            nome: listaSeparacao.nome,
            armazem: listaSeparacao.armazem,
            ordens: listaSeparacao.ordens,
            documento: listaSeparacao.documento,
            responsavelSeparacao: listaSeparacao.responsavel,
            responsavelConferencia: '',
            dataConferencia: new Date().toISOString(),
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
        const lista = this.listas.find(l => String(l.id) === String(id));
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
        this.updateButtonStates();
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

        this.listas = this.listas.filter(l => String(l.id) !== String(id));
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
            this.updateButtonStates();

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

        // Check if ALL items have been verified (OK or FALTA)
        const itensPendentes = this.listaAtual.itens.filter(i => !i.ok && !i.falta);
        if (itensPendentes.length > 0) {
            App.showToast(`Ainda existem ${itensPendentes.length} itens não verificados. Marque todos como OK ou FALTA.`, 'warning');
            return;
        }

        // BLOQUEIO: Se houver itens com FALTA, não pode finalizar - apenas salvar com pendências
        const itensFalta = this.listaAtual.itens.filter(i => i.falta);
        if (itensFalta.length > 0) {
            // Listar os itens em falta
            const listaFalta = itensFalta.slice(0, 10).map(i =>
                `<li><strong>${i.codigo}</strong> - ${i.descricao || 'Sem descrição'}</li>`
            ).join('');

            const maisItens = itensFalta.length > 10 ? `<p>... e mais ${itensFalta.length - 10} itens</p>` : '';

            const body = `
                <div style="text-align: center; padding: 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🚫</div>
                    <h3 style="color: #dc3545; margin-bottom: 1rem;">Não é Possível Finalizar!</h3>
                    <p style="margin-bottom: 1rem;">Existem <strong>${itensFalta.length}</strong> itens marcados como <span style="color: #dc3545; font-weight: bold;">FALTA</span>:</p>
                    <ul style="text-align: left; margin: 1rem 2rem; list-style: none; padding: 0; font-size: 0.9rem;">
                        ${listaFalta}
                    </ul>
                    ${maisItens}
                    <p style="color: #0d6efd; font-weight: bold; margin-top: 1rem;">Use o botão "Salvar com Pendências" para salvar esta lista.</p>
                </div>
            `;

            const footer = `
                <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
                <button class="btn btn-warning" onclick="App.closeModal(); Conferencia.salvarComPendencias();">Salvar com Pendências</button>
            `;

            App.showModal('Itens com FALTA', body, footer);
            return;
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
            lista.dataFinalizacao = new Date().toISOString();
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
        let listasPendentes = this.listas.filter(l => l.status === 'pendente');

        // Sort A-Z by name
        listasPendentes = listasPendentes.sort((a, b) => a.nome.localeCompare(b.nome));

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
                <div class="list-card ${hasFalta ? 'urgent' : 'pending'}" onclick="Conferencia.abrirLista('${lista.id}')">
                    <div class="list-card-header">
                        <span class="list-card-title">${lista.nome}</span>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span class="list-card-badge ${hasFalta ? 'danger' : 'pending'}">${hasFalta ? '🚨 URGENTE' : 'Pendente'}</span>
                            ${Auth.isAdmin() ? `<button class="btn-delete-item" onclick="event.stopPropagation(); Conferencia.excluirLista('${lista.id}')" title="Excluir lista">✕</button>` : ''}
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

        // Sort A-Z by código
        itens = itens.sort((a, b) => a.codigo.localeCompare(b.codigo));

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
    },

    /**
 * Show transfer list modal for verification
 * Now uses qtdSeparada from separadoPorOP (Lupa) instead of original quantity
 */
    mostrarListaTransferencia() {
        if (!this.listaAtual) return;

        // Get original separação list to show transferred items
        const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));

        if (!separacao) {
            App.showToast('Lista de separação original não encontrada', 'warning');
            return;
        }

        // Get items that were transferred (not naoSeparado and were transferred)
        const itensTransferidos = separacao.itens.filter(i => i.transferido && !i.naoSeparado);

        // Initialize verificacao array if not exists
        if (!this.listaAtual.itensTransferenciaVerificados) {
            this.listaAtual.itensTransferenciaVerificados = [];
        }

        // Sort A-Z by código
        itensTransferidos.sort((a, b) => a.codigo.localeCompare(b.codigo));

        const itensHTML = itensTransferidos.map(item => {
            const isVerificado = this.listaAtual.itensTransferenciaVerificados.includes(item.id);

            // Use qtdSeparada (from Lupa) instead of original quantidade
            const qtdSeparada = item.qtdSeparada || 0;
            const qtdOriginal = item.quantidade || 0;

            // Show warning if different from original
            const diferenca = qtdOriginal - qtdSeparada;
            const statusClass = diferenca > 0 ? 'style="color: #dc3545; font-weight: bold;"' : '';
            const statusInfo = diferenca > 0 ? `<small style="color: #dc3545;">(Faltam ${diferenca.toLocaleString('pt-BR')})</small>` : '';

            return `
            <tr>
                <td>
                    <input type="checkbox" 
                           ${isVerificado ? 'checked' : ''} 
                           onchange="Conferencia.toggleTransferenciaItem(${item.id}, this.checked)">
                </td>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td class="center">${qtdOriginal.toLocaleString('pt-BR')}</td>
                <td class="center" ${statusClass}>
                    ${qtdSeparada.toLocaleString('pt-BR')}
                    ${statusInfo}
                </td>
            </tr>
        `;
        }).join('');

        const verificados = this.listaAtual.itensTransferenciaVerificados.length;
        const total = itensTransferidos.length;
        const todosVerificados = verificados === total && total > 0;

        const body = `
        <div style="margin-bottom: 1rem;">
            <p><strong>Documento de Transferência:</strong> ${separacao.documento || 'N/A'}</p>
            <p><strong>Responsável Separação:</strong> ${separacao.responsavel || 'N/A'}</p>
            <p><strong>Verificados:</strong> <span id="countTransferencia">${verificados}</span>/${total} 
               ${todosVerificados ? '✅' : '⏳'}</p>
        </div>
        <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px;">OK</th>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th class="center">Qtd Original</th>
                        <th class="center">Qtd Separada</th>
                    </tr>
                </thead>
                <tbody>
                    ${itensHTML}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 1rem; padding: 0.5rem; background: #fff3cd; border-radius: 4px;">
            <small>⚠️ A <strong>Qtd Separada</strong> é vinculada ao valor definido na Lupa durante a separação. Itens em vermelho indicam quantidade menor que a solicitada.</small>
        </div>
    `;

        const footer = `
        <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
        <button class="btn btn-success" onclick="Conferencia.marcarTodosTransferencia(true)">✅ Marcar Todos</button>
    `;

        App.showModal('📋 Lista de Transferência', body, footer);
    },

    /**
     * Toggle individual transfer item verification
     */
    toggleTransferenciaItem(itemId, checked) {
        if (!this.listaAtual) return;

        if (!this.listaAtual.itensTransferenciaVerificados) {
            this.listaAtual.itensTransferenciaVerificados = [];
        }

        if (checked) {
            if (!this.listaAtual.itensTransferenciaVerificados.includes(itemId)) {
                this.listaAtual.itensTransferenciaVerificados.push(itemId);
            }
        } else {
            this.listaAtual.itensTransferenciaVerificados =
                this.listaAtual.itensTransferenciaVerificados.filter(id => id !== itemId);
        }

        // Update the list in main array
        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.itensTransferenciaVerificados = this.listaAtual.itensTransferenciaVerificados;
        }

        this.save();
        this.updateButtonStates();

        // Update counter in modal
        const counter = document.getElementById('countTransferencia');
        if (counter) {
            const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));
            const total = separacao ? separacao.itens.filter(i => i.transferido && !i.naoSeparado).length : 0;
            counter.textContent = this.listaAtual.itensTransferenciaVerificados.length;
        }
    },

    /**
     * Mark all transfer items as verified
     */
    marcarTodosTransferencia(marcar) {
        if (!this.listaAtual) return;

        const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));
        if (!separacao) return;

        const itensTransferidos = separacao.itens.filter(i => i.transferido && !i.naoSeparado);

        if (marcar) {
            this.listaAtual.itensTransferenciaVerificados = itensTransferidos.map(i => i.id);
        } else {
            this.listaAtual.itensTransferenciaVerificados = [];
        }

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.itensTransferenciaVerificados = this.listaAtual.itensTransferenciaVerificados;
        }

        this.save();
        this.updateButtonStates();
        App.closeModal();
        App.showToast('Todos os itens da transferência foram verificados!', 'success');
    },

    /**
     * Update button states based on verification status
     */
    updateButtonStates() {
        const btnFinalizar = document.getElementById('btnFinalizarConferencia');
        const iconTransferencia = document.getElementById('iconTransferencia');

        if (!btnFinalizar || !this.listaAtual) return;

        // Check if all items are verified (OK or FALTA)
        const todosItensVerificados = this.listaAtual.itens.every(i => i.ok || i.falta);

        // Check if transfer list is verified
        const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));
        let transferenciaOk = false;

        if (separacao) {
            const itensTransferidos = separacao.itens.filter(i => i.transferido && !i.naoSeparado);
            const verificados = this.listaAtual.itensTransferenciaVerificados || [];
            transferenciaOk = itensTransferidos.length > 0 &&
                itensTransferidos.every(i => verificados.includes(i.id));
        }

        // Enable/disable finalize button
        const podeFinalize = todosItensVerificados && transferenciaOk;
        btnFinalizar.disabled = !podeFinalize;

        // Update transfer icon
        if (iconTransferencia) {
            iconTransferencia.textContent = transferenciaOk ? '✅' : '📋';
        }
    }
};
