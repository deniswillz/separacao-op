/**
 * Auth Module
 * Login system with user management, permissions and profile photos
 * Admin: admin / !@agrosystem
 */

const Auth = {
    currentUser: null,
    users: [],

    // Available modules for permissions
    MODULES: [
        { id: 'dashboard', name: 'Dashboard', icon: '🏠' },
        { id: 'enderecos', name: 'Endereços', icon: '📍' },
        { id: 'empenhos', name: 'Empenhos', icon: '📦' },
        { id: 'blacklist', name: 'BlackList', icon: '❌' },
        { id: 'separacao', name: 'Separação', icon: '✅' },
        { id: 'conferencia', name: 'Conferência', icon: '🔍' },
        { id: 'historico', name: 'Histórico', icon: '📚' }
    ],

    getAllPermissions() {
        return this.MODULES.map(m => m.id);
    },

    init() {
        // Try to load users from localStorage (already synced from cloud in App.init)
        const savedUsers = Storage.load(Storage.KEYS.USERS);

        if (savedUsers && savedUsers.length > 0) {
            this.users = savedUsers;
            console.log(`👥 ${this.users.length} usuários carregados`);
        } else {
            // Create default admin if no users exist
            console.log('👤 Criando usuário admin padrão...');
            this.users = [{
                id: 1,
                username: 'admin',
                password: this.hashPassword('!@agrosystem'),
                role: 'admin',
                nome: 'Administrador',
                foto: null,
                dataCriacao: new Date().toLocaleString('pt-BR'),
                permissions: this.getAllPermissions()
            }];
            this.saveUsers();
        }

        const session = sessionStorage.getItem('currentUser');
        if (session) {
            this.currentUser = JSON.parse(session);
            this.showApp();
        } else {
            this.showLogin();
        }
    },

    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    },

    saveUsers() {
        Storage.save(Storage.KEYS.USERS, this.users);
    },

    login(username, password) {
        const user = this.users.find(u =>
            u.username.toLowerCase() === username.toLowerCase()
        );

        if (!user) {
            return { success: false, message: 'Usuário não encontrado' };
        }

        if (user.password !== this.hashPassword(password)) {
            return { success: false, message: 'Senha incorreta' };
        }

        this.currentUser = {
            id: user.id,
            username: user.username,
            role: user.role,
            nome: user.nome,
            foto: user.foto || null,
            permissions: user.permissions || this.getAllPermissions()
        };

        sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        this.showApp();
        return { success: true };
    },

    logout() {
        this.currentUser = null;
        sessionStorage.removeItem('currentUser');
        this.showLogin();
    },

    showLogin() {
        document.getElementById('loginOverlay').classList.add('show');
        document.getElementById('appContainer').style.display = 'none';
    },

    showApp() {
        document.getElementById('loginOverlay').classList.remove('show');
        document.getElementById('appContainer').style.display = 'flex';

        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.currentUser) {
            const foto = this.currentUser.foto || this.getDefaultAvatar(this.currentUser.nome);
            userInfo.innerHTML = `
                <div class="user-avatar-small" onclick="Auth.showProfilePanel()" style="background-image: url('${foto}')"></div>
                <span class="user-name" onclick="Auth.showProfilePanel()">${this.currentUser.nome}</span>
                <button class="btn-logout" onclick="Auth.logout()">Sair</button>
            `;
        }

        const configTab = document.querySelector('[data-tab="configuracoes"]');
        if (configTab) {
            configTab.style.display = this.isAdmin() ? 'flex' : 'none';
        }

        this.applyPermissions();
    },

    getDefaultAvatar(nome) {
        const initials = nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');

        // Background color based on name
        const colors = ['#008B5B', '#2563EB', '#7C3AED', '#DC2626', '#EA580C', '#0891B2'];
        const colorIndex = nome.charCodeAt(0) % colors.length;
        ctx.fillStyle = colors[colorIndex];
        ctx.fillRect(0, 0, 100, 100);

        // Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, 50, 50);

        return canvas.toDataURL();
    },

    applyPermissions() {
        if (!this.currentUser) return;

        const permissions = this.currentUser.permissions || [];
        const isAdmin = this.isAdmin();

        this.MODULES.forEach(mod => {
            const tab = document.querySelector(`[data-tab="${mod.id}"]`);
            if (tab) {
                const hasAccess = isAdmin || permissions.includes(mod.id);
                tab.style.display = hasAccess ? 'flex' : 'none';
            }
        });
    },

    hasPermission(moduleId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        return (this.currentUser.permissions || []).includes(moduleId);
    },

    showProfilePanel() {
        const user = this.users.find(u => u.id === this.currentUser.id);
        const foto = user?.foto || this.getDefaultAvatar(this.currentUser.nome);
        const isAdmin = this.isAdmin();

        const permissionsHtml = this.currentUser.permissions?.map(p => {
            const mod = this.MODULES.find(m => m.id === p);
            return mod ? `<span class="permission-tag">${mod.icon} ${mod.name}</span>` : '';
        }).join('') || '';

        const body = `
            <div class="profile-panel">
                <div class="profile-header">
                    <div class="profile-avatar-container">
                        <div class="profile-avatar" style="background-image: url('${foto}')"></div>
                        <label class="profile-avatar-edit" for="profilePhotoInput">
                            📷 Alterar foto
                        </label>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display: none;" onchange="Auth.uploadPhoto(this)">
                    </div>
                    <div class="profile-info">
                        <h2>${this.currentUser.nome}</h2>
                        <p class="profile-username">@${this.currentUser.username}</p>
                        <span class="role-badge ${this.currentUser.role}">${isAdmin ? '👑 Administrador' : '👤 Usuário'}</span>
                    </div>
                </div>
                
                <div class="profile-section">
                    <h4>📋 Meus Acessos</h4>
                    <div class="permissions-display">
                        ${isAdmin ? '<span class="permission-tag admin">✨ Acesso Total</span>' : permissionsHtml}
                    </div>
                </div>

                <div class="profile-section">
                    <h4>🔐 Alterar Senha</h4>
                    <div class="profile-form">
                        <div class="form-group">
                            <label>Senha Atual</label>
                            <input type="password" id="currentPassword" placeholder="Digite sua senha atual">
                        </div>
                        <div class="form-group">
                            <label>Nova Senha</label>
                            <input type="password" id="newPassword" placeholder="Digite a nova senha">
                        </div>
                        <div class="form-group">
                            <label>Confirmar Nova Senha</label>
                            <input type="password" id="confirmNewPassword" placeholder="Confirme a nova senha">
                        </div>
                        <button class="btn btn-primary" onclick="Auth.changeMyPassword()">
                            Salvar Nova Senha
                        </button>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="App.closeModal()">Fechar</button>
        `;

        App.showModal('Meu Perfil', body, footer);
    },

    uploadPhoto(input) {
        if (!input.files || !input.files[0]) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize to 200x200
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 200;
                const ctx = canvas.getContext('2d');

                // Center crop
                const size = Math.min(img.width, img.height);
                const x = (img.width - size) / 2;
                const y = (img.height - size) / 2;

                ctx.drawImage(img, x, y, size, size, 0, 0, 200, 200);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                this.savePhoto(dataUrl);
            };
            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    },

    savePhoto(dataUrl) {
        const user = this.users.find(u => u.id === this.currentUser.id);
        if (user) {
            user.foto = dataUrl;
            this.currentUser.foto = dataUrl;
            sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            this.saveUsers();
            this.showApp();
            App.closeModal();
            setTimeout(() => this.showProfilePanel(), 100);
            App.showToast('Foto atualizada com sucesso!', 'success');
        }
    },

    changeMyPassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            App.showToast('Preencha todos os campos de senha', 'warning');
            return;
        }

        const user = this.users.find(u => u.id === this.currentUser.id);
        if (!user) {
            App.showToast('Usuário não encontrado', 'error');
            return;
        }

        if (user.password !== this.hashPassword(currentPassword)) {
            App.showToast('Senha atual incorreta', 'error');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            App.showToast('As novas senhas não coincidem', 'error');
            return;
        }

        if (newPassword.length < 4) {
            App.showToast('A nova senha deve ter pelo menos 4 caracteres', 'warning');
            return;
        }

        user.password = this.hashPassword(newPassword);
        this.saveUsers();

        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';

        App.showToast('Senha alterada com sucesso!', 'success');
    },

    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    },

    // User Management (Admin only)
    createUser(username, password, nome, role = 'user', permissions = []) {
        if (!this.isAdmin()) {
            return { success: false, message: 'Apenas administradores podem criar usuários' };
        }

        if (this.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return { success: false, message: 'Nome de usuário já existe' };
        }

        const newUser = {
            id: Date.now(),
            username: username,
            password: this.hashPassword(password),
            role: role,
            nome: nome,
            foto: null,
            dataCriacao: new Date().toLocaleString('pt-BR'),
            permissions: role === 'admin' ? this.getAllPermissions() : permissions
        };

        this.users.push(newUser);
        this.saveUsers();

        return { success: true, message: 'Usuário criado com sucesso' };
    },

    updateUser(userId, updates) {
        if (!this.isAdmin()) {
            return { success: false, message: 'Apenas administradores podem editar usuários' };
        }

        const userIndex = this.users.findIndex(u => String(u.id) === String(userId));
        if (userIndex === -1) {
            return { success: false, message: 'Usuário não encontrado' };
        }

        if (this.users[userIndex].username === 'admin' && updates.role && updates.role !== 'admin') {
            return { success: false, message: 'Não é possível alterar o papel do admin' };
        }

        if (updates.password) {
            updates.password = this.hashPassword(updates.password);
        }

        if (updates.role === 'admin') {
            updates.permissions = this.getAllPermissions();
        }

        this.users[userIndex] = { ...this.users[userIndex], ...updates };
        this.saveUsers();

        return { success: true, message: 'Usuário atualizado' };
    },

    deleteUser(userId) {
        if (!this.isAdmin()) {
            return { success: false, message: 'Apenas administradores podem excluir usuários' };
        }

        const user = this.users.find(u => String(u.id) === String(userId));
        if (!user) {
            return { success: false, message: 'Usuário não encontrado' };
        }

        if (user.username === 'admin') {
            return { success: false, message: 'Não é possível excluir o admin' };
        }

        this.users = this.users.filter(u => String(u.id) !== String(userId));
        this.saveUsers();

        return { success: true, message: 'Usuário excluído' };
    },

    getUsers() {
        return this.users.map(u => ({
            id: u.id,
            username: u.username,
            nome: u.nome,
            role: u.role,
            foto: u.foto,
            dataCriacao: u.dataCriacao,
            permissions: u.permissions || []
        }));
    }
};
