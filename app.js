/**
 * Main Application
 * Separação de Ordens de Produção
 */

const App = {
    currentTab: 'dashboard',

    async init() {
        // Initialize Supabase first
        if (typeof SupabaseClient !== 'undefined') {
            await SupabaseClient.init();
            if (SupabaseClient.isOnline) {
                console.log('🌐 Modo online - dados sincronizados');
                // Load users from cloud BEFORE Auth.init
                await Storage.loadFromCloud(Storage.KEYS.USERS);
            } else {
                console.log('📴 Modo offline - usando localStorage');
            }
        }

        // Initialize Auth (will use users loaded from cloud)
        Auth.init();

        // Setup login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        const btnLogin = document.getElementById('btnLogin');
        if (btnLogin) {
            btnLogin.addEventListener('click', () => {
                this.handleLogin();
            });
        }

        // Update date/time
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 1000);

        // Setup navigation
        this.setupNavigation();

        // Setup export button
        const btnExport = document.getElementById('btnExportData');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                this.exportAllData();
            });
        }

        // Setup modal
        const modalClose = document.getElementById('modalClose');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeModal();
            });
        }

        const modal = document.getElementById('modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'modal') {
                    this.closeModal();
                }
            });
        }

        // Initialize all modules (only if logged in)
        if (Auth.currentUser) {
            await this.initModules();
        }

        console.log('App initialized' + (SupabaseClient?.isOnline ? ' (Online)' : ' (Offline)'));
    },

    async initModules() {
        // Load data from cloud FIRST (before modules init)
        if (SupabaseClient?.isOnline) {
            await Storage.loadAllFromCloud();
            this.showToast('Dados sincronizados com a nuvem!', 'success');
        }

        // NOW initialize modules (they will load fresh data from localStorage)
        Dashboard.init();
        Enderecos.init();
        Empenhos.init();
        Blacklist.init();
        Separacao.init();
        Conferencia.init();
        Historico.init();
        Configuracoes.init();

        // Start Realtime subscriptions (after modules registered their callbacks)
        if (SupabaseClient?.isOnline) {
            SupabaseClient.initRealtimeSubscriptions();
        }

        // Render dashboard with fresh data
        Dashboard.render();

        // Check for automatic backup (17:45)
        Storage.checkAutoBackup();

        // Check backup every 5 minutes
        setInterval(() => {
            Storage.checkAutoBackup();
        }, 5 * 60 * 1000);
    },

    handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            this.showToast('Preencha todos os campos', 'warning');
            return;
        }

        const result = Auth.login(username, password);

        if (result.success) {
            this.showToast('Login realizado com sucesso!', 'success');
            this.initModules();
            // Clear form
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
        } else {
            this.showToast(result.message, 'error');
        }
    },

    updateDateTime() {
        const now = new Date();

        const dateOptions = {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        };

        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };

        const dateEl = document.getElementById('currentDate');
        const timeEl = document.getElementById('currentTime');

        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('pt-BR', dateOptions);
        }
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('pt-BR', timeOptions);
        }
    },

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });
    },

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabName);
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        this.currentTab = tabName;

        // Modules that need real-time data sync
        const syncModules = ['dashboard', 'separacao', 'conferencia', 'historico'];

        // Reload from cloud before rendering for critical modules
        if (syncModules.includes(tabName) && SupabaseClient?.isOnline) {
            this.reloadModuleData(tabName);
        } else {
            this.renderTab(tabName);
        }
    },

    async reloadModuleData(tabName) {
        try {
            // Reload specific data based on tab
            if (tabName === 'dashboard' || tabName === 'separacao') {
                await Storage.loadFromCloud(Storage.KEYS.SEPARACAO);
            }
            if (tabName === 'dashboard' || tabName === 'conferencia') {
                await Storage.loadFromCloud(Storage.KEYS.CONFERENCIA);
            }
            if (tabName === 'historico') {
                await Storage.loadFromCloud(Storage.KEYS.HISTORICO);
            }
        } catch (e) {
            console.warn('⚠️ Erro ao atualizar dados:', e);
        }

        this.renderTab(tabName);
    },

    renderTab(tabName) {
        // Trigger render on tab switch
        switch (tabName) {
            case 'dashboard':
                Dashboard.render();
                break;
            case 'cadastro':
                Cadastro.render();
                break;
            case 'enderecos':
                Enderecos.render();
                break;
            case 'empenhos':
                Empenhos.renderOPSelector();
                Empenhos.renderPendentes();
                break;
            case 'blacklist':
                Blacklist.render();
                break;
            case 'separacao':
                Separacao.renderListas();
                break;
            case 'conferencia':
                Conferencia.renderListas();
                break;
            case 'historico':
                Historico.render();
                break;
            case 'configuracoes':
                Configuracoes.render();
                break;
        }
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    showModal(title, body, footer = '', size = 'default') {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer;

        const modalContent = document.querySelector('.modal-content');
        // Reset to default size first
        modalContent.style.maxWidth = '';

        // Apply size variant
        if (size === 'large') {
            modalContent.style.maxWidth = '900px';
        } else if (size === 'xlarge') {
            modalContent.style.maxWidth = '1100px';
        }

        document.getElementById('modal').classList.add('show');
    },

    closeModal() {
        document.getElementById('modal').classList.remove('show');
        // Reset modal size
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.maxWidth = '';
        }
    },

    showUrgencyAlert(urgencias) {
        const urgencyModal = document.getElementById('urgencyModal');
        const urgencyBody = document.getElementById('urgencyBody');

        if (!urgencyModal || !urgencyBody) return;

        // Build content
        urgencyBody.innerHTML = urgencias.map(u => `
            <div class="urgency-item">
                <div>
                    <div class="urgency-item-op">${u.nome}</div>
                    <div class="urgency-item-info">🏭 ${u.armazem} | OPs: ${u.ordens}</div>
                    <div class="urgency-item-info" style="margin-top: 0.5rem;">
                        <strong>${u.qtdFalta} itens faltando:</strong><br>
                        ${u.itens.join('<br>')}
                        ${u.itens.length < u.qtdFalta ? '<br>...' : ''}
                    </div>
                </div>
            </div>
        `).join('');

        // Show modal
        urgencyModal.classList.add('show');

        // Inicia o alarme persistente
        this.startAlertSound();
    },

    closeUrgencyModal() {
        const urgencyModal = document.getElementById('urgencyModal');
        if (urgencyModal) {
            urgencyModal.classList.remove('show');
        }
        // Para o alarme quando o modal é fechado
        this.stopAlertSound();
    },

    alertInterval: null,

    startAlertSound() {
        // Para qualquer alarme anterior
        this.stopAlertSound();

        // Toca imediatamente
        this.playAlertBeep();

        // Repete a cada 2 segundos até ser fechado
        this.alertInterval = setInterval(() => {
            this.playAlertBeep();
        }, 2000);
    },

    stopAlertSound() {
        if (this.alertInterval) {
            clearInterval(this.alertInterval);
            this.alertInterval = null;
        }
    },

    playAlertBeep() {
        // Create audio context for beep sound
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create oscillator for beep
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800; // Hz
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);

            // Second beep after short pause
            setTimeout(() => {
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();

                osc2.connect(gain2);
                gain2.connect(audioContext.destination);

                osc2.frequency.value = 1000;
                osc2.type = 'sine';

                gain2.gain.setValueAtTime(0.5, audioContext.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

                osc2.start(audioContext.currentTime);
                osc2.stop(audioContext.currentTime + 0.5);
            }, 200);

            // Third beep
            setTimeout(() => {
                const osc3 = audioContext.createOscillator();
                const gain3 = audioContext.createGain();

                osc3.connect(gain3);
                gain3.connect(audioContext.destination);

                osc3.frequency.value = 1200;
                osc3.type = 'sine';

                gain3.gain.setValueAtTime(0.5, audioContext.currentTime);
                gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

                osc3.start(audioContext.currentTime);
                osc3.stop(audioContext.currentTime + 0.8);
            }, 400);

        } catch (e) {
            console.log('Audio not supported:', e);
        }
    },

    exportAllData() {
        try {
            const allData = Storage.exportAll();
            const dataStr = JSON.stringify(allData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `backup_separacao_${new Date().toISOString().slice(0, 10)}.json`;
            link.click();

            this.showToast('Dados exportados com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            this.showToast('Erro ao exportar dados', 'error');
        }
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
