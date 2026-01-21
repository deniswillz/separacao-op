/**
 * Separação Module
 * - Blacklist items auto-checked as "Não Separado"
 * - Can only send if items are separated AND transferred (except blacklist/naoSeparado)
 */

const Separacao = {
    listas: [],
    listaAtual: null,

    listView: null,
    detailView: null,
    cardsContainer: null,
    emptyState: null,
    tableBody: null,

    init() {
        this.listView = document.getElementById('separacaoListView');
        this.detailView = document.getElementById('separacaoDetailView');
        this.cardsContainer = document.getElementById('separacaoListas');
        this.emptyState = document.getElementById('emptySeparacaoListas');
        this.tableBody = document.querySelector('#tableSeparacao tbody');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.SEPARACAO);
        if (saved) {
            this.listas = saved;
        }

        // Setup event listeners
        const btnVoltar = document.getElementById('btnVoltarSeparacao');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                this.voltarParaLista();
            });
        }

        const btnEnviar = document.getElementById('btnEnviarConferencia');
        if (btnEnviar) {
            btnEnviar.addEventListener('click', () => {
                this.enviarParaConferencia();
            });
        }

        const btnSalvarPendente = document.getElementById('btnSalvarPendenteSeparacao');
        if (btnSalvarPendente) {
            btnSalvarPendente.addEventListener('click', () => {
                this.salvarComPendencias();
            });
        }

        const searchInput = document.getElementById('searchSeparacao');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderItens();
            });
        }

        // Scanner Logic
        const scannerInput = document.getElementById('scannerInputSeparacao');
        if (scannerInput) {
            scannerInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleScan(scannerInput.value);
                    scannerInput.value = '';
                }
            });
            // Keep focus
            document.addEventListener('click', () => {
                if (this.detailView.style.display === 'block') {
                    scannerInput.focus();
                }
            });
        }

        // Auto-save info fields
        ['docTransferencia', 'responsavelSeparacao'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    this.saveInfo();
                });
            }
        });

        // Register realtime callback
        SupabaseClient.onRealtimeUpdate('separacao', (payload) => {
            console.log('🔄 Separacao: recebida atualização remota');
            this.reload();
        });

        this.renderListas();
    },

    /**
     * Reload data from cloud and refresh UI
     */
    async reload() {
        const cloudData = await Storage.loadFromCloud(Storage.KEYS.SEPARACAO);
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
                }
            }
        }
    },

    criarLista(lista) {
        // VERIFICAR DUPLICIDADE: Evitar listas com mesmo ID ou mesmo nome no mesmo armazém
        const existe = this.listas.find(l =>
            String(l.id) === String(lista.id) ||
            (l.nome === lista.nome && l.armazem === lista.armazem && l.status === 'pendente')
        );

        if (existe) {
            console.warn('⚠️ Lista já existe, ignorando criação duplicada');
            return;
        }

        // Auto-mark blacklist items as "naoSeparado"
        const blacklistCodes = Blacklist.getBlacklistedCodes();
        lista.itens.forEach(item => {
            if (blacklistCodes.includes(item.codigo)) {
                item.naoSeparado = true;
            }
        });

        this.listas.push(lista);
        this.save();
        this.renderListas();

        // Audit log
        Auditoria.log('CRIAR_LISTA_SEPARACAO', {
            nome: lista.nome,
            armazem: lista.armazem,
            qtdItens: lista.itens.length
        });
    },

    save() {
        Storage.save(Storage.KEYS.SEPARACAO, this.listas);
    },

    saveInfo() {
        if (!this.listaAtual) return;

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.documento = document.getElementById('docTransferencia').value;
            lista.responsavel = document.getElementById('responsavelSeparacao').value;
            this.save();
        }
    },

    salvarComPendencias() {
        if (!this.listaAtual) return;

        const responsavel = document.getElementById('responsavelSeparacao').value;
        if (!responsavel) {
            App.showToast('Informe o responsável pela separação', 'warning');
            document.getElementById('responsavelSeparacao').focus();
            return;
        }

        this.saveInfo();
        this.voltarParaLista();
        App.showToast('Progresso de separação salvo com sucesso!', 'success');
    },

    async abrirLista(id) {
        const lista = this.listas.find(l => String(l.id) === String(id));
        if (!lista) return;

        // Force a reload to get the latest status from cloud before checking lock
        await this.reload();
        const updatedLista = this.listas.find(l => String(l.id) === String(id));
        if (!updatedLista) return;

        // BLOQUEIO MULTI-USUÁRIO: Verificar se já está em uso por outro usuário
        if (updatedLista.usuarioAtual && updatedLista.usuarioAtual !== (Auth.currentUser?.nome || 'Anônimo')) {
            const body = `
                <div style="text-align: center; padding: 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
                    <h3 style="color: #dc3545; margin-bottom: 1rem;">Lista em Uso!</h3>
                    <p>Esta lista está sendo editada por: <strong style="color: #0d6efd;">${updatedLista.usuarioAtual}</strong></p>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">Para evitar duplicidade de dados, aguarde o outro usuário terminar ou peça para ele fechar o card.</p>
                </div>
            `;
            App.showModal('Acesso Bloqueado', body, `<button class="btn btn-primary" onclick="App.closeModal()">Entendi</button>`);
            return;
        }

        this.listaAtual = updatedLista;

        document.getElementById('separacaoListaTitulo').textContent = updatedLista.nome;
        document.getElementById('separacaoListaInfo').textContent =
            `Armazém: ${updatedLista.armazem} | Criado em: ${updatedLista.dataCriacao}`;

        document.getElementById('docTransferencia').value = updatedLista.documento || '';

        // Auto-fill responsável with current user name if empty
        const responsavel = updatedLista.responsavel || Auth.currentUser?.nome || '';
        document.getElementById('responsavelSeparacao').value = responsavel;

        // Mark as in use by current user IMMEDIATELY
        updatedLista.usuarioAtual = Auth.currentUser?.nome || 'Anônimo';
        await Storage.saveImmediate(Storage.KEYS.SEPARACAO, this.listas);

        this.listView.style.display = 'none';
        this.detailView.style.display = 'block';

        this.renderItens();
        this.updateStats();
    },

    async voltarParaLista() {
        if (this.listaAtual) {
            // Clear in use status IMEDIATELY
            const lista = this.listas.find(l => l.id === this.listaAtual.id);
            if (lista) {
                lista.usuarioAtual = null;
                await Storage.saveImmediate(Storage.KEYS.SEPARACAO, this.listas);
            }
        }
        this.listaAtual = null;
        this.detailView.style.display = 'none';
        this.listView.style.display = 'block';
        this.renderListas();
    },

    updateItem(itemId, field, value) {
        if (!this.listaAtual) return;

        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (!lista) return;

        const item = lista.itens.find(i => i.id === itemId);
        if (item) {
            if (field === 'qtdSeparada') {
                item[field] = parseFloat(value) || 0;
            } else {
                item[field] = value;
            }

            // If marking as naoSeparado, uncheck separado and transferido
            if (field === 'naoSeparado' && value) {
                item.separado = false;
                item.transferido = false;
            }

            // If marking as separado, uncheck naoSeparado
            if (field === 'separado' && value) {
                item.naoSeparado = false;
            }

            this.listaAtual = lista;
            this.save();
            this.updateStats();
            this.renderItens();
        }
    },

    updateStats() {
        if (!this.listaAtual) return;

        const blacklistCodes = Blacklist.getBlacklistedCodes();

        // Only count items that are NOT blacklisted and NOT marked as naoSeparado
        const itensValidos = this.listaAtual.itens.filter(i =>
            !blacklistCodes.includes(i.codigo) && !i.naoSeparado
        );

        const total = itensValidos.length;
        const separados = itensValidos.filter(i => i.separado).length;
        const transferidos = itensValidos.filter(i => i.transferido).length;
        const naoSeparados = this.listaAtual.itens.filter(i => i.naoSeparado).length;

        document.getElementById('totalSeparar').textContent = total;
        document.getElementById('totalSeparados').textContent = separados;
        document.getElementById('totalTransferidos').textContent = transferidos;
        document.getElementById('totalNaoSeparados').textContent = naoSeparados;
    },

    enviarParaConferencia() {
        if (!this.listaAtual) return;

        const responsavel = document.getElementById('responsavelSeparacao').value;
        if (!responsavel) {
            App.showToast('Informe o responsável pela separação', 'warning');
            document.getElementById('responsavelSeparacao').focus();
            return;
        }

        // Validação do documento de transferência (obrigatório)
        const documento = document.getElementById('docTransferencia').value.trim();
        if (!documento) {
            App.showToast('Informe o documento de transferência', 'warning');
            document.getElementById('docTransferencia').focus();
            return;
        }

        const blacklistCodes = Blacklist.getBlacklistedCodes();

        // Check if all valid items (not blacklist, not naoSeparado) are separated AND transferred
        const itensParaSeparar = this.listaAtual.itens.filter(item =>
            !blacklistCodes.includes(item.codigo) && !item.naoSeparado
        );

        const itensPendentes = itensParaSeparar.filter(item =>
            !item.separado || !item.transferido
        );

        if (itensPendentes.length > 0) {
            App.showToast(`${itensPendentes.length} itens ainda não foram separados E transferidos!`, 'error');
            return;
        }

        // Update lista status
        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            lista.status = 'em_conferencia';
            lista.documento = documento;
            lista.responsavel = responsavel;

            // Ajustar qtdSeparada: se for 0, iguala à quantidade solicitada
            lista.itens.forEach(item => {
                if ((item.qtdSeparada === 0 || item.qtdSeparada === undefined) && item.separado) {
                    item.qtdSeparada = item.quantidade;
                }
            });

            // NOVO: Avançar status no Matriz x Filial para "Conferência"
            if (typeof MatrizFilial !== 'undefined') {
                MatrizFilial.updateStatusByOPs(lista.ordens, 'conferencia');
            }

            this.save();
        }

        // Send list to Conferência (only items that were separated, not blacklist)
        Conferencia.receberLista(lista);

        this.voltarParaLista();
        App.switchTab('conferencia');
        App.showToast(`Lista enviada para conferência`, 'success');
    },

    deletarLista(id) {
        const lista = this.listas.find(l => String(l.id) === String(id));
        if (!lista) return;

        if (!confirm(`Deseja realmente excluir a lista "${lista.nome}"? Isso removerá também os registros pendentes vinculados em Matriz x Filial e Conferência.`)) {
            return;
        }

        // 1. CASCADE DELETE: Matriz x Filial (remover registros das OPs)
        if (typeof MatrizFilial !== 'undefined') {
            MatrizFilial.removeRecordsByOPs(lista.ordens);
        }

        // 2. CASCADE DELETE: Conferência (remover lista vinculada se existir)
        if (typeof Conferencia !== 'undefined') {
            const listId = String(id);
            Conferencia.listas = Conferencia.listas.filter(l => String(l.separacaoId) !== listId);
            Conferencia.save();
        }

        // 3. Remover a lista de separação
        this.listas = this.listas.filter(l => String(l.id) !== String(id));
        this.save();
        this.renderListas();

        // Update dashboard stats
        if (typeof Dashboard !== 'undefined') Dashboard.render();

        App.showToast('Lista e dependências excluídas!', 'success');
    },

    excluirLista(id) {
        this.deletarLista(id);
    },

    renderListas() {
        let listasDisponiveis = this.listas.filter(l => l.status === 'pendente');

        // Sort A-Z by name
        listasDisponiveis = listasDisponiveis.sort((a, b) => a.nome.localeCompare(b.nome));

        if (listasDisponiveis.length === 0) {
            this.cardsContainer.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.cardsContainer.innerHTML = listasDisponiveis.map(lista => {
            const inUseBy = lista.usuarioAtual;
            const inUseBadge = inUseBy && inUseBy !== Auth.currentUser?.nome
                ? `<div class="list-status-badge in-use">👀 Aberto por: ${inUseBy}</div>`
                : '';

            return `
            <div class="list-card pending border-separacao" onclick="Separacao.abrirLista('${lista.id}')">
                <div class="list-card-header">
                    <span class="list-card-title">${lista.nome}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="list-card-badge pending">Pendente</span>
                        ${lista.urgencia ? `<span class="urgency-badge urgency-${lista.urgencia === 'urgencia' ? 'extrema' : lista.urgencia}">${lista.urgencia.toUpperCase()}</span>` : ''}
                        ${Auth.isAdmin() ? `<button class="btn-delete-item" onclick="event.stopPropagation(); Separacao.excluirLista('${lista.id}')" title="Excluir lista">✕</button>` : ''}
                    </div>
                </div>
                <div class="list-card-info">
                    <span><strong>Armazém:</strong> ${lista.armazem}</span>
                    <span><strong>Ordens:</strong> ${lista.ordens.length}</span>
                </div>
                <div class="list-card-footer">
                    <span class="list-card-date">${lista.dataCriacao}</span>
                    <span class="list-card-count">${lista.itens.length} itens</span>
                </div>
                ${inUseBadge}
            </div>
        `}).join('');
    },

    renderItens() {
        if (!this.listaAtual) {
            this.tableBody.innerHTML = '';
            return;
        }

        const searchTerm = document.getElementById('searchSeparacao').value.toLowerCase();
        const blacklistData = Blacklist.getBlacklistedData();
        const blacklistCodes = blacklistData.map(item => item.codigo);

        let filtered = this.listaAtual.itens;

        if (searchTerm) {
            filtered = filtered.filter(item =>
                item.codigo.toLowerCase().includes(searchTerm) ||
                item.descricao.toLowerCase().includes(searchTerm)
            );
        }

        // Picking Path Optimization: Sort by Address sequence
        filtered = filtered.sort((a, b) => {
            const addrA = Enderecos.getEndereco(a.codigo) || 'ZZZZ';
            const addrB = Enderecos.getEndereco(b.codigo) || 'ZZZZ';
            return addrA.localeCompare(addrB);
        });

        if (filtered.length === 0) {
            this.tableBody.innerHTML = '';
            document.getElementById('emptySeparacao').classList.add('show');
            return;
        }

        document.getElementById('emptySeparacao').classList.remove('show');

        this.tableBody.innerHTML = filtered.map(item => {
            const blItem = blacklistData.find(bl => bl.codigo === item.codigo);
            const isBlacklisted = !!blItem;
            const isTalvez = blItem?.talvez;
            const isNaoSepBlacklist = blItem?.naoSep;

            let rowClass = '';
            if (item.naoSeparado) rowClass += ' has-nao-sep';
            if (isTalvez) rowClass += ' talvez-highlight';
            else if (isBlacklisted && isNaoSepBlacklist) rowClass += ' blacklist-item';

            const isDisabled = (isBlacklisted && isNaoSepBlacklist && !isTalvez) || item.naoSeparado ? 'disabled' : '';
            const isNaoSepCheckboxDisabled = isBlacklisted && isNaoSepBlacklist && !isTalvez ? 'disabled' : '';

            // Lookup description from Cadastro (prioritize Cadastro, fallback to imported)
            const descricaoCadastro = Cadastro.getDescricao(item.codigo);
            const descricao = descricaoCadastro || item.descricao || '-';

            // Lookup address and armazem from Endereços
            const enderecoInfo = Enderecos.getEnderecoInfo(item.codigo);
            const endereco = enderecoInfo ? enderecoInfo.endereco : '-';
            const armazemEnd = enderecoInfo ? enderecoInfo.armazem : '';
            const armazemDisplay = armazemEnd ? ` | 🏭 ${armazemEnd}` : '';

            // Build OP info for popup
            const opInfoJson = item.qtdPorOP ? JSON.stringify(item.qtdPorOP).replace(/"/g, '&quot;') : '{}';
            const opsDisplay = item.ordens && item.ordens.length > 0 ? item.ordens.join(', ') : '-';

            // Check if all OPs are marked OK (green lupa)
            const isFullySeparated = this.isItemFullySeparated(item);
            const lupaColor = isFullySeparated ? 'color: #28a745;' : '';
            const lupaTitle = isFullySeparated ? 'Item totalmente separado ✓' : 'Ver OPs deste item';

            return `
                <tr class="${rowClass}">
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>${item.codigo}</span>
                            <button class="btn-lupa" style="${lupaColor}" onclick="Separacao.showOPInfo('${item.codigo}', '${opInfoJson}')" title="${lupaTitle}">
                                ${isFullySeparated ? '✅' : '🔍'}
                            </button>
                        </div>
                    </td>
                    <td>
                        <div>${descricao}</div>
                        <small class="endereco-info">📍 ${endereco}${armazemDisplay}</small>
                    </td>
                    <td class="center">${item.quantidade.toLocaleString('pt-BR')}</td>
                    <td class="center">
                        <input type="number" 
                               value="${item.qtdSeparada || 0}" 
                               min="0"
                               style="width: 80px;${(item.qtdSeparada || 0) > item.quantidade ? ' color: red; border-color: red; font-weight: bold;' : ''}"
                               ${isDisabled}
                               onchange="Separacao.updateItem(${item.id}, 'qtdSeparada', this.value)">
                    </td>
                    <td class="center">
                        <input type="checkbox" 
                               ${item.separado ? 'checked' : ''} 
                               ${isDisabled}
                               onchange="Separacao.updateItem(${item.id}, 'separado', this.checked)">
                    </td>
                    <td class="center">
                        <input type="checkbox" 
                               ${item.transferido ? 'checked' : ''} 
                               ${isDisabled}
                               onchange="Separacao.updateItem(${item.id}, 'transferido', this.checked)">
                    </td>
                    <td class="center">
                        <input type="checkbox" 
                               ${item.naoSeparado ? 'checked' : ''} 
                               ${isNaoSepCheckboxDisabled}
                               onchange="Separacao.updateItem(${item.id}, 'naoSeparado', this.checked)">
                    </td>
                    <td>
                        <input type="text" 
                               value="${item.observacao || ''}" 
                               placeholder="Observação..."
                               onchange="Separacao.updateItem(${item.id}, 'observacao', this.value)">
                    </td>
                </tr>
            `;
        }).join('');
    },

    showOPInfo(codigo, opInfoJson) {
        const qtdPorOP = JSON.parse(opInfoJson.replace(/&quot;/g, '"'));
        const ops = Object.keys(qtdPorOP);

        if (ops.length === 0) {
            App.showToast('Nenhuma OP associada a este item', 'warning');
            return;
        }

        // Get current item to access separadoPorOP
        const item = this.listaAtual?.itens.find(i => i.codigo === codigo);
        if (!item) return;

        // Initialize separadoPorOP if not exists
        if (!item.separadoPorOP) {
            item.separadoPorOP = {};
            ops.forEach(op => {
                item.separadoPorOP[op] = { qtdSeparada: 0, ok: false };
            });
        }

        let totalSolicitado = 0;
        let totalSeparado = 0;

        const rows = ops.map(op => {
            const qtdSolicitada = qtdPorOP[op];
            totalSolicitado += qtdSolicitada;

            const sepInfo = item.separadoPorOP[op] || { qtdSeparada: 0, ok: false };
            totalSeparado += sepInfo.qtdSeparada || 0;

            return `
                <tr data-op="${op}">
                    <td><strong>OP ${op}</strong></td>
                    <td class="center">${qtdSolicitada.toLocaleString('pt-BR')}</td>
                    <td class="center">
                        <input type="number" 
                               id="sep_${op}" 
                               value="${sepInfo.qtdSeparada || 0}" 
                               min="0" 
                               max="${qtdSolicitada}"
                               step="0.01"
                               style="width: 80px;"
                               onchange="Separacao.updateSeparadoPorOP('${codigo}', '${op}', 'qtdSeparada', parseFloat(this.value) || 0)">
                    </td>
                    <td class="center">
                        <input type="checkbox" 
                               id="ok_${op}"
                               ${sepInfo.ok ? 'checked' : ''} 
                               onchange="Separacao.updateSeparadoPorOP('${codigo}', '${op}', 'ok', this.checked)">
                    </td>
                </tr>
            `;
        }).join('');

        const body = `
            <div class="op-info-popup">
                <p><strong>Código:</strong> ${codigo}</p>
                <p><strong>Descrição:</strong> ${item.descricao || '-'}</p>
                <table class="op-info-table" style="width: 100%; margin-top: 1rem;">
                    <thead>
                        <tr>
                            <th>Ordem de Produção</th>
                            <th style="text-align: center;">Qtd Solicitada</th>
                            <th style="text-align: center;">Qtd Separada</th>
                            <th style="text-align: center;">OK</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f5f5f5; font-weight: bold;">
                            <td>TOTAL</td>
                            <td class="center">${totalSolicitado.toLocaleString('pt-BR')}</td>
                            <td class="center" id="totalSeparado">${totalSeparado.toLocaleString('pt-BR')}</td>
                            <td class="center">-</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="margin-top: 1rem; padding: 0.5rem; background: #e8f5e9; border-radius: 4px;">
                    <small>💡 Ao marcar <strong>OK</strong>, se a quantidade separada for 0, ela será preenchida automaticamente com a quantidade solicitada.</small>
                </div>
            </div>
        `;

        App.showModal(`🔍 Detalhes do Item`, body, `
            <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
            <button class="btn btn-success" onclick="Separacao.salvarSeparadoPorOP('${codigo}'); App.closeModal();">✔️ Salvar e Fechar</button>
        `);
    },

    updateSeparadoPorOP(codigo, op, field, value) {
        const item = this.listaAtual?.itens.find(i => i.codigo === codigo);
        if (!item) return;

        if (!item.separadoPorOP) {
            item.separadoPorOP = {};
        }

        if (!item.separadoPorOP[op]) {
            item.separadoPorOP[op] = { qtdSeparada: 0, ok: false };
        }

        // If checking OK and qtdSeparada is 0, auto-fill with solicitada
        if (field === 'ok' && value === true) {
            const qtdSolicitada = item.qtdPorOP?.[op] || 0;
            if ((item.separadoPorOP[op].qtdSeparada || 0) === 0) {
                item.separadoPorOP[op].qtdSeparada = qtdSolicitada;
                const input = document.getElementById(`sep_${op}`);
                if (input) input.value = qtdSolicitada;
            }
        }

        item.separadoPorOP[op][field] = value;

        // Update total in modal
        this.updateLupaTotal(item);
    },

    updateLupaTotal(item) {
        if (!item.separadoPorOP) return;

        let total = 0;
        Object.values(item.separadoPorOP).forEach(sep => {
            total += sep.qtdSeparada || 0;
        });

        const totalEl = document.getElementById('totalSeparado');
        if (totalEl) {
            totalEl.textContent = total.toLocaleString('pt-BR');
        }
    },

    salvarSeparadoPorOP(codigo) {
        const item = this.listaAtual?.itens.find(i => i.codigo === codigo);
        if (!item || !item.separadoPorOP) return;

        // Calculate total qtdSeparada from all OPs
        let totalSeparado = 0;
        Object.values(item.separadoPorOP).forEach(sep => {
            totalSeparado += sep.qtdSeparada || 0;
        });

        // Update item's qtdSeparada with total
        item.qtdSeparada = totalSeparado;

        // Check if all OPs are OK
        const allOK = Object.values(item.separadoPorOP).every(sep => sep.ok);
        if (allOK && !item.separado) {
            item.separado = true;
        }

        // Find and update lista
        const lista = this.listas.find(l => l.id === this.listaAtual.id);
        if (lista) {
            const listaItem = lista.itens.find(i => i.codigo === codigo);
            if (listaItem) {
                listaItem.separadoPorOP = item.separadoPorOP;
                listaItem.qtdSeparada = totalSeparado;
                listaItem.separado = item.separado;
            }
        }

        this.save();
        this.renderItens();
        this.updateStats();

        App.showToast('Quantidades salvas!', 'success');
    },

    isItemFullySeparated(item) {
        if (!item.separadoPorOP || !item.qtdPorOP) return false;

        const ops = Object.keys(item.qtdPorOP);
        return ops.every(op => {
            const sepInfo = item.separadoPorOP[op];
            return sepInfo && sepInfo.ok;
        });
    },

    handleScan(codigo) {
        if (!this.listaAtual) return;
        const cleanCode = codigo.trim().toUpperCase();
        const item = this.listaAtual.itens.find(i => i.codigo.toUpperCase() === cleanCode);

        if (item) {
            // Highlight the row or open OP details
            document.getElementById('searchSeparacao').value = cleanCode;
            this.renderItens();
            App.playSound('success');

            // If item has only 1 OP and not separated, maybe auto-open?
            if (item.ordens.length === 1) {
                // For now just filter and notify
                App.showToast(`Produto encontrado: ${item.descricao}`, 'success');
            } else {
                this.showOPInfo(item.codigo, JSON.stringify(item.qtdPorOP));
            }
        } else {
            App.playSound('error');
            App.showToast(`Produto ${cleanCode} não encontrado nesta lista!`, 'error');
        }
    }
};
