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
                tab: 'separacao'
            });
        });

        conferenciaListas.filter(l => l.status === 'pendente' && !l.itens.some(i => i.falta)).forEach(l => {
            pendencias.push({
                id: l.id,
                nome: l.nome,
                armazem: l.armazem || 'N/A',
                tipo: 'Conferência',
                tab: 'conferencia'
            });
        });

        if (pendencias.length === 0) {
            container.innerHTML = '<p class="empty-text">Nenhuma pendência</p>';
            return;
        }

        container.innerHTML = pendencias.map(p => `
            <div class="dashboard-list-item" onclick="App.switchTab('${p.tab}')">
                <div class="item-info">
                    <span class="item-name">${p.nome}</span>
                    <span class="item-armazem">🏭 ${p.armazem}</span>
                </div>
                <span class="item-status pending">${p.tipo}</span>
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
            <div class="dashboard-list-item" onclick="App.switchTab('historico')">
                <div class="item-info">
                    <span class="item-name">${r.nome}</span>
                    <span class="item-armazem">🏭 ${r.armazem || 'N/A'}</span>
                </div>
                <span class="item-status completed">Finalizado</span>
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
    }
};
