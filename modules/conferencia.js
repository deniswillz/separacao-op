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

        const btnReverter = document.getElementById('btnReverterSituacao');
        if (btnReverter) {
            btnReverter.addEventListener('click', () => {
                this.reverterSituacao();
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
        // VERIFICAR DUPLICIDADE: Evitar receber a mesma lista de separação mais de uma vez
        const existe = this.listas.find(l => String(l.separacaoId) === String(listaSeparacao.id));
        if (existe) {
            console.warn('⚠️ Lista de conferência já existe para esta separação, ignorando');
            return;
        }

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

        // BLOQUEIO MULTI-USUÁRIO: Verificar se já está em uso por outro usuário
        if (lista.usuarioAtual && lista.usuarioAtual !== (Auth.currentUser?.nome || 'Anônimo')) {
            const body = `
                <div style="text-align: center; padding: 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
                    <h3 style="color: #dc3545; margin-bottom: 1rem;">Lista em Uso!</h3>
                    <p>Esta lista está sendo conferida por: <strong style="color: #0d6efd;">${lista.usuarioAtual}</strong></p>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">Para evitar duplicidade de dados, aguarde o outro usuário terminar ou peça para ele fechar o card.</p>
                </div>
            `;
            App.showModal('Acesso Bloqueado', body, `<button class="btn btn-primary" onclick="App.closeModal()">Entendi</button>`);
            return;
        }

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
            // this.save(); // Not saving yet, only when edited or user confirms
        }

        // Mark as in use by current user
        lista.usuarioAtual = Auth.currentUser?.nome || 'Anônimo';
        this.save();

        document.getElementById('dataConferencia').value = lista.dataConferencia;

        this.populateOPFilter();
        this.renderOrdens();

        this.listView.style.display = 'none';
        this.detailView.style.display = 'block';

        // Show "Voltar Situação" button if it's an admin or if needed
        const btnReverter = document.getElementById('btnReverterSituacao');
        if (btnReverter) {
            btnReverter.style.display = 'block';
        }

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
        if (this.listaAtual) {
            // Limpar status de uso
            const lista = this.listas.find(l => l.id === this.listaAtual.id);
            if (lista) {
                lista.usuarioAtual = null;
                this.save();
            }
        }
        this.listaAtual = null;
        this.filtroOP = '';
        this.detailView.style.display = 'none';
        this.listView.style.display = 'block';

        const btnReverter = document.getElementById('btnReverterSituacao');
        if (btnReverter) btnReverter.style.display = 'none';

        this.renderListas();
    },

    reverterSituacao() {
        if (!this.listaAtual) return;

        if (!confirm('Deseja realmente voltar esta conferência para a etapa de SEPARAÇÃO?')) {
            return;
        }

        // Find original separação list
        const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));
        if (separacao) {
            separacao.status = 'pendente';
        }

        // Remove from conferencia
        this.listas = this.listas.filter(l => String(l.id) !== String(this.listaAtual.id));

        // Save both
        Separacao.save();
        this.save();

        // Audit log
        Auditoria.log('REVERTER_SITUACAO', {
            nome: this.listaAtual.nome,
            id: this.listaAtual.id
        });

        this.voltarParaLista();
        App.showToast('Conferência revertida para Separação!', 'success');
        App.switchTab('separacao');
    },

    excluirLista(id) {
        const lista = this.listas.find(l => String(l.id) === String(id));
        if (!lista) return;

        if (!confirm('Deseja realmente excluir esta lista de conferência? Isso removerá também os registros pendentes vinculados em Matriz x Filial.')) {
            return;
        }

        // CASCADE DELETE: Matriz x Filial (remover registros das OPs)
        if (typeof MatrizFilial !== 'undefined') {
            MatrizFilial.removeRecordsByOPs(lista.ordens);
        }

        this.listas = this.listas.filter(l => String(l.id) !== String(id));
        this.save();
        this.renderListas();

        if (typeof Dashboard !== 'undefined') Dashboard.render();

        App.showToast('Lista de conferência e registros vinculados excluídos!', 'success');
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

        // REQUIRE DIGITAL SIGNATURE
        this.showSignatureModal(lista);
    },

    showSignatureModal(lista) {
        const body = `
            <div style="text-align: center;">
                <p style="margin-bottom: 1rem;">Confirme a conferência com sua assinatura digital:</p>
                <div style="border: 2px dashed #ccc; background: #fff; position: relative; margin-bottom: 1rem;">
                    <canvas id="signatureCanvas" width="500" height="200" style="touch-action: none; cursor: crosshair; max-width: 100%;"></canvas>
                    <button class="btn-clear-sig" onclick="Conferencia.clearSignature()" style="position: absolute; top: 5px; right: 5px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; color: #333;">Limpar</button>
                </div>
                <small style="color: #666;">Use o mouse ou dispositivo touch para assinar.</small>
            </div>
        `;

        App.showModal('✍️ Assinatura Digital', body, `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancelar</button>
            <button class="btn btn-success" id="btnConfirmSignature">Confirmar e Finalizar</button>
        `, 'medium');

        setTimeout(() => {
            this.initSignatureCanvas();
            document.getElementById('btnConfirmSignature').addEventListener('click', () => {
                const canvas = document.getElementById('signatureCanvas');
                const sigData = canvas.toDataURL();
                this.confirmFinalization(lista, sigData);
            });
        }, 200);
    },

    initSignatureCanvas() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let painting = false;

        function startPosition(e) {
            painting = true;
            draw(e);
        }

        function finishedPosition() {
            painting = false;
            ctx.beginPath();
        }

        function draw(e) {
            if (!painting) return;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000';

            const rect = canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);

            const x = clientX - rect.left;
            const y = clientY - rect.top;

            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        canvas.addEventListener('mousedown', startPosition);
        canvas.addEventListener('mouseup', finishedPosition);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startPosition(e); });
        canvas.addEventListener('touchend', finishedPosition);
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); });
    },

    clearSignature() {
        const canvas = document.getElementById('signatureCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    },

    confirmFinalization(lista, sigData) {
        lista.assinatura = sigData;

        Historico.adicionarRegistro(lista);

        // NOVO: Avançar status no Matriz x Filial para "Qualidade"
        if (typeof MatrizFilial !== 'undefined') {
            MatrizFilial.updateStatusByOPs(lista.ordens, 'qualidade');
        }

        this.listas = this.listas.filter(l => l.id !== lista.id);
        this.save();

        Auditoria.log('FINALIZAR_CONFERENCIA_ASSINADA', {
            nome: lista.nome,
            id: lista.id
        });

        App.closeModal();
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

            const inUseBy = lista.usuarioAtual;
            const inUseBadge = inUseBy && inUseBy !== Auth.currentUser?.nome
                ? `<div class="list-status-badge in-use">👀 Aberto por: ${inUseBy}</div>`
                : '';

            return `
                <div class="list-card ${hasFalta ? 'urgent' : 'pending'}" onclick="Conferencia.abrirLista('${lista.id}')">
                    <div class="list-card-header">
                        <span class="list-card-title">${lista.nome}</span>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span class="list-card-badge ${hasFalta ? 'danger' : 'pending'}">${hasFalta ? '🚨 URGENTE' : 'Pendente'}</span>
                            ${lista.urgencia ? `<span class="urgency-badge urgency-${lista.urgencia === 'urgencia' ? 'extrema' : lista.urgencia}">${lista.urgencia.toUpperCase()}</span>` : ''}
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
                    ${inUseBadge}
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
 * Uses data from conferência itself (which already has the separated quantities)
 */
    mostrarListaTransferencia() {
        if (!this.listaAtual) return;

        // Try to get original separação list for additional info
        const separacao = Separacao.listas.find(l => String(l.id) === String(this.listaAtual.separacaoId));

        // Use conferência items directly (they already have quantidade and qtdSeparada)
        const itensConferencia = this.listaAtual.itens || [];

        if (itensConferencia.length === 0) {
            App.showToast('Nenhum item na lista de conferência', 'warning');
            return;
        }

        // Initialize verificacao array if not exists
        if (!this.listaAtual.itensTransferenciaVerificados) {
            this.listaAtual.itensTransferenciaVerificados = [];
        }

        // GROUP ITEMS BY CODE
        const itensAgrupados = {};
        this.listaAtual.itens.forEach(item => {
            if (!itensAgrupados[item.codigo]) {
                itensAgrupados[item.codigo] = {
                    codigo: item.codigo,
                    descricao: item.descricao,
                    quantidade: 0,
                    qtdSeparada: 0,
                    ordens: []
                };
            }
            itensAgrupados[item.codigo].quantidade += item.quantidade || 0;
            itensAgrupados[item.codigo].qtdSeparada += item.qtdSeparada || 0;
            if (item.ordens) {
                item.ordens.forEach(op => {
                    if (!itensAgrupados[item.codigo].ordens.includes(op)) {
                        itensAgrupados[item.codigo].ordens.push(op);
                    }
                });
            }
        });

        // Convert to array and sort A-Z by código
        const itensSorted = Object.values(itensAgrupados).sort((a, b) => a.codigo.localeCompare(b.codigo));

        const itensHTML = itensSorted.map(item => {
            const isVerificado = this.listaAtual.itensTransferenciaVerificados.includes(item.codigo);

            // quantidade = Qtd Solicitada (original), qtdSeparada = Qtd Separada (from Lupa)
            const qtdSolicitada = item.quantidade || 0;
            const qtdSeparada = item.qtdSeparada || 0;

            // Show warning if different from original
            const diferenca = qtdSolicitada - qtdSeparada;
            const statusClass = diferenca > 0 ? 'style="color: #dc3545; font-weight: bold;"' : '';
            const statusInfo = diferenca > 0 ? `<small style="color: #dc3545;">(Faltam ${diferenca.toLocaleString('pt-BR')})</small>` : '';

            const opInfo = item.ordens && item.ordens.length > 0 ? `<small style="color: #666;">OP: ${item.ordens.join(', ')}</small>` : '';

            return `
            <tr>
                <td style="text-align: center; vertical-align: middle;">
                    <input type="checkbox" 
                           ${isVerificado ? 'checked' : ''} 
                           onchange="Conferencia.toggleTransferenciaItem('${item.codigo}', this.checked)">
                </td>
                <td style="vertical-align: middle;">
                    <div>${item.codigo}</div>
                    ${opInfo}
                </td>
                <td style="vertical-align: middle;">${item.descricao || '-'}</td>
                <td style="text-align: center; vertical-align: middle;">${qtdSolicitada.toLocaleString('pt-BR')}</td>
                <td style="text-align: center; vertical-align: middle;" ${statusClass}>
                    ${qtdSeparada.toLocaleString('pt-BR')}
                    ${statusInfo}
                </td>
            </tr>
        `;
        }).join('');

        const verificados = this.listaAtual.itensTransferenciaVerificados.length;
        const total = itensSorted.length;
        const todosVerificados = verificados === total && total > 0;

        // Use data from conferência or separação
        const documento = this.listaAtual.documento || separacao?.documento || 'N/A';
        const responsavel = this.listaAtual.responsavelSeparacao || separacao?.responsavel || 'N/A';

        const body = `
        <div style="margin-bottom: 1rem;">
            <p><strong>Documento de Transferência:</strong> ${documento}</p>
            <p><strong>Responsável Separação:</strong> ${responsavel}</p>
            <p><strong>Verificados:</strong> <span id="countTransferencia">${verificados}</span>/${total} 
               ${todosVerificados ? '✅' : '⏳'}</p>
        </div>
        <div class="table-container" style="max-height: 400px; overflow: auto;">
            <table class="data-table" style="min-width: 650px; width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 50px; text-align: center;">OK</th>
                        <th style="width: 160px;">Código</th>
                        <th style="min-width: 180px;">Descrição</th>
                        <th style="width: 100px; text-align: center;">Qtd Solic.</th>
                        <th style="width: 100px; text-align: center;">Qtd Separ.</th>
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

        App.showModal('📋 Lista de Transferência', body, footer, 'large');
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
            // Use codes instead of ids
            const codes = [...new Set(this.listaAtual.itens.map(i => i.codigo))];
            this.listaAtual.itensTransferenciaVerificados = codes;
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
            const itensAteConferencia = this.listaAtual.itens || [];
            const codesToVerify = [...new Set(itensAteConferencia.map(i => i.codigo))];
            const verificados = this.listaAtual.itensTransferenciaVerificados || [];

            transferenciaOk = codesToVerify.length > 0 &&
                codesToVerify.every(code => verificados.includes(code));
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
