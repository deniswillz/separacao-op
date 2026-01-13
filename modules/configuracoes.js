/**
 * Configurações Module
 * User management for admins with permissions
 */

const Configuracoes = {
    init() {
        if (!Auth.isAdmin()) return;

        this.setupEventListeners();
        this.render();
    },

    setupEventListeners() {
        const btnAddUser = document.getElementById('btnAddUser');
        if (btnAddUser) {
            btnAddUser.addEventListener('click', () => {
                this.showAddUserModal();
            });
        }

        const btnExportData = document.getElementById('btnExportData');
        if (btnExportData) {
            btnExportData.addEventListener('click', () => {
                App.exportAllData();
            });
        }

        const btnResetData = document.getElementById('btnResetData');
        if (btnResetData) {
            btnResetData.addEventListener('click', () => {
                this.resetAllData();
            });
        }
    },

    resetAllData() {
        const body = `
            <div style="text-align: center; padding: 1rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc3545; margin-bottom: 1rem;">Resetar Dados</h3>
                <p style="margin-bottom: 1rem;">Selecione quais dados deseja apagar:</p>
                
                <div style="text-align: left; margin: 1rem auto; max-width: 300px;">
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #f8f9fa; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer;">
                        <input type="checkbox" id="resetCadastro" style="margin-right: 0.5rem;"> 📋 Cadastro de Produtos
                    </label>
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #f8f9fa; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer;">
                        <input type="checkbox" id="resetEnderecos" style="margin-right: 0.5rem;"> 📍 Endereços de Estoque
                    </label>
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #f8f9fa; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer;">
                        <input type="checkbox" id="resetBlacklist" style="margin-right: 0.5rem;"> ❌ BlackList
                    </label>
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #fff3cd; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer; border: 1px solid #ffc107;">
                        <input type="checkbox" id="resetSeparacao" style="margin-right: 0.5rem;"> ✅ Listas de Separação
                    </label>
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #fff3cd; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer; border: 1px solid #ffc107;">
                        <input type="checkbox" id="resetConferencia" style="margin-right: 0.5rem;"> 🔍 Listas de Conferência
                    </label>
                    <label style="display: flex; align-items: center; padding: 0.5rem; background: #fff3cd; margin-bottom: 0.25rem; border-radius: 4px; cursor: pointer; border: 1px solid #ffc107;">
                        <input type="checkbox" id="resetHistorico" style="margin-right: 0.5rem;"> 📚 Histórico
                    </label>
                </div>

                <p style="color: #dc3545; font-weight: bold; margin-top: 1rem;">Esta ação NÃO pode ser desfeita!</p>
                <div style="margin-top: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem;">Digite <strong>CONFIRMAR</strong> para prosseguir:</label>
                    <input type="text" id="confirmReset" placeholder="Digite CONFIRMAR" style="width: 100%; padding: 0.5rem; text-align: center;">
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="Configuracoes.executeReset()">Resetar Selecionados</button>
        `;

        App.showModal('Resetar Dados', body, footer);
    },

    async executeReset() {
        const confirmInput = document.getElementById('confirmReset');
        if (!confirmInput || confirmInput.value !== 'CONFIRMAR') {
            App.showToast('Digite CONFIRMAR para prosseguir', 'warning');
            return;
        }

        // Check which items are selected
        const selections = {
            cadastro: document.getElementById('resetCadastro')?.checked,
            enderecos: document.getElementById('resetEnderecos')?.checked,
            blacklist: document.getElementById('resetBlacklist')?.checked,
            separacao: document.getElementById('resetSeparacao')?.checked,
            conferencia: document.getElementById('resetConferencia')?.checked,
            historico: document.getElementById('resetHistorico')?.checked
        };

        const anySelected = Object.values(selections).some(v => v);
        if (!anySelected) {
            App.showToast('Selecione pelo menos um item para resetar', 'warning');
            return;
        }

        App.showToast('Resetando dados selecionados...', 'info');

        let resetCount = 0;

        // Reset only selected items
        if (selections.cadastro) {
            Storage.save(Storage.KEYS.CADASTRO, []);
            Cadastro.data = [];
            Cadastro.render();
            resetCount++;
        }

        if (selections.enderecos) {
            Storage.save(Storage.KEYS.ENDERECOS, []);
            Enderecos.data = [];
            Enderecos.render();
            resetCount++;
        }

        if (selections.blacklist) {
            Storage.save(Storage.KEYS.BLACKLIST, []);
            Blacklist.data = [];
            Blacklist.render();
            resetCount++;
        }

        if (selections.separacao) {
            Storage.save(Storage.KEYS.SEPARACAO, []);
            Storage.save(Storage.KEYS.SEPARACAO_INFO, []);
            Separacao.listas = [];
            Separacao.renderListas();
            resetCount++;
        }

        if (selections.conferencia) {
            Storage.save(Storage.KEYS.CONFERENCIA, []);
            Storage.save(Storage.KEYS.CONFERENCIA_INFO, []);
            Conferencia.listas = [];
            Conferencia.renderListas();
            resetCount++;
        }

        if (selections.historico) {
            Storage.save(Storage.KEYS.HISTORICO, []);
            Historico.registros = [];
            Historico.render();
            resetCount++;
        }

        Dashboard.render();
        App.closeModal();
        App.showToast(`${resetCount} tipo(s) de dados resetados com sucesso!`, 'success');
    },

    render() {
        this.renderUsers();
    },

    renderUsers() {
        const container = document.getElementById('usersTableBody');
        if (!container) return;

        const users = Auth.getUsers();

        container.innerHTML = users.map(user => {
            const permCount = user.permissions ? user.permissions.length : 0;
            const totalPerm = Auth.MODULES.length;

            return `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.nome}</td>
                    <td>
                        <span class="role-badge ${user.role}">${user.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
                    </td>
                    <td>
                        <span class="permission-count">${user.role === 'admin' ? 'Todos' : `${permCount}/${totalPerm}`}</span>
                    </td>
                    <td>${user.dataCriacao}</td>
                    <td>
                        ${user.username !== 'admin' ? `
                            <button class="btn-action edit" onclick="Configuracoes.editUser('${user.id}')" title="Editar">✏️</button>
                            <button class="btn-action delete" onclick="Configuracoes.deleteUser('${user.id}')" title="Excluir">🗑️</button>
                        ` : '<span class="text-muted">Protegido</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    },

    generatePermissionsCheckboxes(selectedPermissions = [], disabled = false) {
        return Auth.MODULES.map(mod => {
            const checked = selectedPermissions.includes(mod.id) ? 'checked' : '';
            const disabledAttr = disabled ? 'disabled' : '';
            return `
                <label class="permission-checkbox">
                    <input type="checkbox" name="permissions" value="${mod.id}" ${checked} ${disabledAttr}>
                    <span>${mod.icon} ${mod.name}</span>
                </label>
            `;
        }).join('');
    },

    showAddUserModal() {
        const body = `
            <form id="formAddUser">
                <div class="form-group">
                    <label>Nome de Usuário</label>
                    <input type="text" id="newUsername" required placeholder="usuario">
                </div>
                <div class="form-group">
                    <label>Nome Completo</label>
                    <input type="text" id="newNome" required placeholder="Nome Sobrenome">
                </div>
                <div class="form-group">
                    <label>Senha</label>
                    <input type="password" id="newPassword" required placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label>Confirmar Senha</label>
                    <input type="password" id="confirmPassword" required placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label>Tipo de Usuário</label>
                    <select id="newRole" onchange="Configuracoes.togglePermissions()">
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                    </select>
                </div>
                <div class="form-group" id="permissionsGroup">
                    <label>Permissões de Acesso</label>
                    <div class="permissions-grid">
                        ${this.generatePermissionsCheckboxes(['dashboard'])}
                    </div>
                    <small class="text-muted">Selecione os módulos que o usuário poderá acessar</small>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancelar</button>
            <button class="btn btn-success" onclick="Configuracoes.addUser()">Criar Usuário</button>
        `;

        App.showModal('Novo Usuário', body, footer);
    },

    togglePermissions() {
        const role = document.getElementById('newRole')?.value || document.getElementById('editRole')?.value;
        const permGroup = document.getElementById('permissionsGroup');

        if (permGroup) {
            if (role === 'admin') {
                permGroup.style.display = 'none';
            } else {
                permGroup.style.display = 'block';
            }
        }
    },

    getSelectedPermissions() {
        const checkboxes = document.querySelectorAll('input[name="permissions"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },

    addUser() {
        const username = document.getElementById('newUsername').value.trim();
        const nome = document.getElementById('newNome').value.trim();
        const password = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const role = document.getElementById('newRole').value;
        const permissions = this.getSelectedPermissions();

        if (!username || !nome || !password) {
            App.showToast('Preencha todos os campos', 'warning');
            return;
        }

        if (password !== confirmPassword) {
            App.showToast('As senhas não coincidem', 'error');
            return;
        }

        if (password.length < 4) {
            App.showToast('A senha deve ter pelo menos 4 caracteres', 'warning');
            return;
        }

        if (role === 'user' && permissions.length === 0) {
            App.showToast('Selecione pelo menos uma permissão', 'warning');
            return;
        }

        const result = Auth.createUser(username, password, nome, role, permissions);

        if (result.success) {
            App.closeModal();
            App.showToast(result.message, 'success');
            this.renderUsers();
        } else {
            App.showToast(result.message, 'error');
        }
    },

    editUser(userId) {
        const users = Auth.getUsers();
        const user = users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const isAdmin = user.role === 'admin';
        const permissionsDisplay = isAdmin ? 'none' : 'block';

        const body = `
            <form id="formEditUser">
                <div class="form-group">
                    <label>Nome de Usuário</label>
                    <input type="text" value="${user.username}" disabled>
                </div>
                <div class="form-group">
                    <label>Nome Completo</label>
                    <input type="text" id="editNome" value="${user.nome}" required>
                </div>
                <div class="form-group">
                    <label>Nova Senha (deixe em branco para manter)</label>
                    <input type="password" id="editPassword" placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label>Tipo de Usuário</label>
                    <select id="editRole" onchange="Configuracoes.togglePermissions()">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
                    </select>
                </div>
                <div class="form-group" id="permissionsGroup" style="display: ${permissionsDisplay};">
                    <label>Permissões de Acesso</label>
                    <div class="permissions-grid">
                        ${this.generatePermissionsCheckboxes(user.permissions || [])}
                    </div>
                    <small class="text-muted">Selecione os módulos que o usuário poderá acessar</small>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Cancelar</button>
            <button class="btn btn-success" onclick="Configuracoes.saveUser('${userId}')">Salvar</button>
        `;

        App.showModal('Editar Usuário', body, footer);
    },

    saveUser(userId) {
        const nome = document.getElementById('editNome').value.trim();
        const password = document.getElementById('editPassword').value;
        const role = document.getElementById('editRole').value;
        const permissions = this.getSelectedPermissions();

        if (role === 'user' && permissions.length === 0) {
            App.showToast('Selecione pelo menos uma permissão', 'warning');
            return;
        }

        const updates = { nome, role, permissions };
        if (password) {
            updates.password = password;
        }

        const result = Auth.updateUser(userId, updates);

        if (result.success) {
            App.closeModal();
            App.showToast(result.message, 'success');
            this.renderUsers();
        } else {
            App.showToast(result.message, 'error');
        }
    },

    deleteUser(userId) {
        if (!confirm('Deseja realmente excluir este usuário?')) {
            return;
        }

        const result = Auth.deleteUser(userId);

        if (result.success) {
            App.showToast(result.message, 'success');
            this.renderUsers();
        } else {
            App.showToast(result.message, 'error');
        }
    }
};
