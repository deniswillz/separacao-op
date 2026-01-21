/**
 * Dashboard Module
 * Shows pending/completed orders, warehouse distribution, and urgency alerts
 */

const Dashboard = {
    periodo: 7,
    alertShown: false,

    init() {
        const periodoSelect = document.getElementById('dashboardPeriodo');
        if (periodoSelect) {
            periodoSelect.addEventListener('change', (e) => {
                this.periodo = parseInt(e.target.value);
                this.render();
            });
        }

        const btnInsights = document.getElementById('btnShowInsights');
        if (btnInsights) {
            btnInsights.addEventListener('click', () => this.showInsights());
        }

        this.render();
        this.checkUrgentItems();
    },

    render() {
        this.updateStats();
        this.renderArmazens();
        this.renderUrgencias();
        this.renderPendencias();
        this.renderFinalizadas();
    },

    isWithinPeriod(dateStr, days) {
        if (!dateStr) return false;

        let date;

        // Verifica se é formato ISO (yyyy-mm-dd ou yyyy-mm-ddThh:mm:ss)
        if (dateStr.includes('-') && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            date = new Date(dateStr);
        } else {
            // Formato brasileiro: dd/mm/yyyy ou dd/mm/yyyy, hh:mm:ss
            const cleanDate = dateStr.replace(',', '');
            const parts = cleanDate.split(' ')[0].split('/');
            if (parts.length < 3) return false;
            date = new Date(parts[2], parts[1] - 1, parts[0]);
        }

        if (isNaN(date.getTime())) return false;

        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays <= days;
    },

    updateStats() {
        const separacaoListas = Storage.load(Storage.KEYS.SEPARACAO) || [];
        const conferenciaListas = Storage.load(Storage.KEYS.CONFERENCIA) || [];
        const historico = Storage.load(Storage.KEYS.HISTORICO) || [];

        const emSeparacao = separacaoListas.filter(l => l.status === 'pendente').length;
        const emConferencia = conferenciaListas.filter(l => l.status === 'pendente').length;
        const pendentes = emSeparacao + emConferencia;

        const finalizadasPeriodo = historico.filter(r =>
            this.isWithinPeriod(r.dataFinalizacao, this.periodo)
        ).length;

        document.getElementById('dashPendentes').textContent = pendentes;
        document.getElementById('dashFinalizadas').textContent = finalizadasPeriodo;
        document.getElementById('dashEmSeparacao').textContent = emSeparacao;
        document.getElementById('dashEmConferencia').textContent = emConferencia;
    },

    renderArmazens() {
        const container = document.getElementById('listaArmazens');
        const historico = Storage.load(Storage.KEYS.HISTORICO) || [];
        const separacaoListas = Storage.load(Storage.KEYS.SEPARACAO) || [];
        const conferenciaListas = Storage.load(Storage.KEYS.CONFERENCIA) || [];

        const armazemCount = {};

        historico.filter(r => this.isWithinPeriod(r.dataFinalizacao, this.periodo)).forEach(r => {
            const armazem = r.armazem || 'Não definido';
            if (!armazemCount[armazem]) {
                armazemCount[armazem] = { finalizadas: 0, pendentes: 0, urgentes: 0 };
            }
            armazemCount[armazem].finalizadas++;
        });

        [...separacaoListas, ...conferenciaListas]
            .filter(l => l.status === 'pendente')
            .forEach(l => {
                const armazem = l.armazem || 'Não definido';
                if (!armazemCount[armazem]) {
                    armazemCount[armazem] = { finalizadas: 0, pendentes: 0, urgentes: 0 };
                }
                armazemCount[armazem].pendentes++;

                // Check for urgent items (FALTA)
                if (l.itens && l.itens.some(i => i.falta)) {
                    armazemCount[armazem].urgentes++;
                }
            });

        if (Object.keys(armazemCount).length === 0) {
            container.innerHTML = '<p class="empty-text">Nenhum dado disponível</p>';
            return;
        }

        container.innerHTML = Object.entries(armazemCount).map(([armazem, counts]) => `
            <div class="armazem-card ${counts.urgentes > 0 ? 'urgent' : ''}">
                <div class="armazem-name">🏭 ${armazem}</div>
                <div class="armazem-stats">
                    <span class="armazem-stat pending">⏳ ${counts.pendentes} pendentes</span>
                    <span class="armazem-stat completed">✅ ${counts.finalizadas} finalizadas</span>
                    ${counts.urgentes > 0 ? `<span class="armazem-stat urgent">🚨 ${counts.urgentes} urgentes</span>` : ''}
                </div>
            </div>
        `).join('');
    },

    renderUrgencias() {
        const conferenciaListas = Storage.load(Storage.KEYS.CONFERENCIA) || [];
        const urgencias = [];

        conferenciaListas.filter(l => l.status === 'pendente').forEach(l => {
            const itensFalta = l.itens.filter(i => i.falta);
            if (itensFalta.length > 0) {
                urgencias.push({
                    id: l.id,
                    nome: l.nome,
                    armazem: l.armazem,
                    ordens: l.ordens,
                    qtdFalta: itensFalta.length
                });
            }
        });

        // If there are urgencies, show alert section
        const pendenciasSection = document.getElementById('listaPendencias').parentElement;
        let urgenciaSection = document.getElementById('urgenciaSection');

        if (urgencias.length > 0) {
            if (!urgenciaSection) {
                urgenciaSection = document.createElement('div');
                urgenciaSection.id = 'urgenciaSection';
                urgenciaSection.className = 'dashboard-section urgencia';
                pendenciasSection.parentElement.insertBefore(urgenciaSection, pendenciasSection);
            }

            urgenciaSection.innerHTML = `
                <h3>🚨 ALERTAS DE URGÊNCIA - ITENS FALTANDO</h3>
                <div class="urgencia-list">
                    ${urgencias.map(u => `
                        <div class="dashboard-list-item urgent" onclick="App.switchTab('conferencia'); Conferencia.abrirLista(${u.id});">
                            <div class="item-info">
                                <span class="item-name">${u.nome}</span>
                                <span class="item-armazem">🏭 ${u.armazem}</span>
                            </div>
                            <span class="item-status danger">${u.qtdFalta} itens FALTANDO</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (urgenciaSection) {
            urgenciaSection.remove();
        }
    },

    renderPendencias() {
        const container = document.getElementById('listaPendencias');
        const separacaoListas = Storage.load(Storage.KEYS.SEPARACAO) || [];
        const conferenciaListas = Storage.load(Storage.KEYS.CONFERENCIA) || [];

        const pendencias = [];

        separacaoListas.filter(l => l.status === 'pendente').forEach(l => {
            pendencias.push({
                id: l.id,
                nome: l.nome,
                armazem: l.armazem || 'N/A',
                tipo: 'Separação',
                tab: 'separacao',
                borderClass: 'border-separacao'
            });
        });

        conferenciaListas.filter(l => l.status === 'pendente' && !l.itens.some(i => i.falta)).forEach(l => {
            pendencias.push({
                id: l.id,
                nome: l.nome,
                armazem: l.armazem || 'N/A',
                tipo: 'Conferência',
                tab: 'conferencia',
                borderClass: 'border-conferencia'
            });
        });

        if (pendencias.length === 0) {
            container.innerHTML = '<p class="empty-text">Nenhuma pendência</p>';
            return;
        }

        container.innerHTML = pendencias.map(p => `
            <div class="dashboard-card-item ${p.borderClass}" onclick="App.switchTab('${p.tab}')">
                <div class="card-item-header">
                    <span class="card-item-badge ${p.tab}">${p.tipo}</span>
                </div>
                <div class="card-item-body">
                    <span class="card-item-name">${p.nome}</span>
                    <span class="card-item-armazem">🏭 ${p.armazem}</span>
                </div>
            </div>
        `).join('');
    },

    renderFinalizadas() {
        const container = document.getElementById('listaFinalizadas');
        const historico = Storage.load(Storage.KEYS.HISTORICO) || [];

        const finalizadasPeriodo = historico.filter(r =>
            this.isWithinPeriod(r.dataFinalizacao, this.periodo)
        );

        if (finalizadasPeriodo.length === 0) {
            container.innerHTML = '<p class="empty-text">Nenhuma ordem finalizada no período</p>';
            return;
        }

        container.innerHTML = finalizadasPeriodo.map(r => `
            <div class="dashboard-card-item border-finalizado" onclick="App.switchTab('historico')">
                <div class="card-item-header">
                    <span class="card-item-badge finalizado">Finalizado</span>
                </div>
                <div class="card-item-body">
                    <span class="card-item-name">${r.nome}</span>
                    <span class="card-item-armazem">🏭 ${r.armazem || 'N/A'}</span>
                </div>
            </div>
        `).join('');
    },

    checkUrgentItems() {
        const conferenciaListas = Storage.load(Storage.KEYS.CONFERENCIA) || [];
        const urgencias = [];

        conferenciaListas.filter(l => l.status === 'pendente').forEach(l => {
            const itensFalta = l.itens.filter(i => i.falta);
            if (itensFalta.length > 0) {
                urgencias.push({
                    nome: l.nome,
                    armazem: l.armazem,
                    ordens: l.ordens.join(', '),
                    qtdFalta: itensFalta.length,
                    itens: itensFalta.slice(0, 5).map(i => i.codigo + ' - ' + i.descricao)
                });
            }
        });

        if (urgencias.length > 0 && !this.alertShown) {
            this.alertShown = true;
            App.showUrgencyAlert(urgencias);
        }
    },

    showInsights() {
        const discrepancies = Historico.getDiscrepancyReport().slice(0, 10);
        const abc = Historico.calculateABC();

        const discrepancyRows = discrepancies.map(d => `
            <tr>
                <td>${d.codigo}</td>
                <td class="center" style="color: var(--danger); font-weight: bold;">${d.qde}</td>
            </tr>
        `).join('') || '<tr><td colspan="2" class="center">Nenhuma divergência registrada</td></tr>';

        // ABC distribution count
        const abcCounts = { A: 0, B: 0, C: 0 };
        Object.values(abc).forEach(grade => abcCounts[grade]++);

        const body = `
            <div class="insights-container">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <h4 style="margin-bottom: 1rem; color: var(--danger);">🚨 Itens com mais Divergências</h4>
                        <small>Faltas registradas na conferência (Top 10)</small>
                        <table class="data-table" style="margin-top: 0.5rem;">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th class="center">Vezes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${discrepancyRows}
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <h4 style="margin-bottom: 1rem; color: var(--primary);">📊 Classificação ABC (Frequência)</h4>
                        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                            <div class="abc-badge a">A: ${abcCounts.A}</div>
                            <div class="abc-badge b">B: ${abcCounts.B}</div>
                            <div class="abc-badge c">C: ${abcCounts.C}</div>
                        </div>
                        <p style="font-size: 0.85rem; color: #666;">
                            <strong>A:</strong> Alta rotatividade (20% dos itens)<br>
                            <strong>B:</strong> Rotatividade média (30% dos itens)<br>
                            <strong>C:</strong> Baixa rotatividade (50% dos itens)
                        </p>
                        <div style="margin-top: 1rem; padding: 1rem; background: var(--gray-50); border-radius: 8px;">
                            <p>💡 <em>Dica: Mantenha os itens <strong>A</strong> nos endereços mais acessíveis para acelerar a separação.</em></p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        App.showModal('📊 Inteligência de Dados - Insights', body, `
            <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
            <button class="btn btn-primary" onclick="Dashboard.showHeatmap()">🎯 Ver Mapa de Calor</button>
        `, 'large');
    },

    showHeatmap() {
        const movement = {};
        const historico = Historico.registros;

        historico.forEach(reg => {
            reg.itens.forEach(item => {
                const key = item.codigo;
                movement[key] = (movement[key] || 0) + 1;
            });
        });

        const sorted = Object.entries(movement).sort((a, b) => b[1] - a[1]);
        const max = sorted[0]?.[1] || 1;

        const heatmapHTML = sorted.map(([codigo, count]) => {
            const intensity = (count / max) * 100;
            return `
                <div class="heatmap-sector">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <strong style="font-size: 0.85rem;">[${codigo}]</strong>
                        <span style="font-size: 0.8rem;">${count} mov.</span>
                    </div>
                    <div class="heatmap-bar" style="width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${intensity}%; height: 100%; background: linear-gradient(to right, var(--warning), var(--danger)); border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        }).join('');

        const body = `
            <div style="padding: 1rem;">
                <p style="margin-bottom: 1.5rem;">Frequência de movimentação por <strong>código de item</strong>:</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; max-height: 400px; overflow-y: auto; padding-right: 0.5rem;">
                    ${heatmapHTML || '<p class="empty-text">Sem dados de movimentação</p>'}
                </div>
                <div style="margin-top: 2rem; padding: 1rem; background: #f0f7ff; border-radius: 8px; font-size: 0.85rem;">
                    💡 <strong>O que isso significa?</strong> Setores em vermelho têm maior fluxo. Considere mover itens pesados ou de alto giro (Classe A) para estas áreas ou para perto das bancadas de conferência.
                </div>
            </div>
        `;

        App.showModal('🔥 Mapa de Calor do Armazém', body, `
            <button class="btn btn-outline" onclick="Dashboard.showInsights()">Voltar</button>
            <button class="btn btn-primary" onclick="App.closeModal()">Fechar</button>
        `, 'medium');
    }
};
