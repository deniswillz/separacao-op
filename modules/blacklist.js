/**
 * BlackList Module
 * Fixed download template
 */

const Blacklist = {
    data: [],
    tableBody: null,
    emptyState: null,

    init() {
        this.tableBody = document.querySelector('#tableBlacklist tbody');
        this.emptyState = document.getElementById('emptyBlacklist');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.BLACKLIST);
        if (saved) {
            this.data = saved;
        }

        // Setup event listeners
        const btnAdd = document.getElementById('btnAddBlacklist');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                this.addItem();
            });
        }

        const btnModelo = document.getElementById('btnModeloBlacklist');
        if (btnModelo) {
            btnModelo.addEventListener('click', () => {
                this.downloadTemplate();
            });
        }

        const importInput = document.getElementById('importBlacklist');
        if (importInput) {
            importInput.addEventListener('change', (e) => {
                this.importExcel(e.target.files[0]);
            });
        }

        const btnLimpar = document.getElementById('btnLimparBlacklist');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                this.clearAll();
            });
        }

        // Enter key support
        const codeInput = document.getElementById('blacklistCode');
        if (codeInput) {
            codeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addItem();
            });
        }

        this.render();
    },

    downloadTemplate() {
        const templateData = [
            { 'Codigo': 'ITEM001', 'Descricao': 'Item que não separa 1' },
            { 'Codigo': 'ITEM002', 'Descricao': 'Item que não separa 2' },
            { 'Codigo': 'ITEM003', 'Descricao': 'Item que não separa 3' }
        ];

        ExcelHelper.exportToExcel(templateData, 'Modelo_BlackList');
        App.showToast('Modelo Excel baixado!', 'success');
    },

    async importExcel(file) {
        if (!file) return;

        try {
            const rawData = await ExcelHelper.readFileWithHeaders(file);

            const existingCodes = new Set(this.data.map(item => item.codigo));
            let duplicatesSkipped = 0;
            let newItems = 0;

            rawData.forEach((row) => {
                const codigo = String(row.Codigo || row.codigo || row.CODIGO || row['Código'] || '').trim().toUpperCase();

                if (!codigo) return;

                if (existingCodes.has(codigo)) {
                    duplicatesSkipped++;
                    return;
                }

                existingCodes.add(codigo);

                this.data.push({
                    id: Date.now() + Math.random(),
                    codigo: codigo,
                    descricao: row.Descricao || row.descricao || row.DESCRICAO || row['Descrição'] || '',
                    naoSep: true, // Default to true if only in list
                    talvez: false,
                    dataInclusao: new Date().toLocaleDateString('pt-BR')
                });

                newItems++;
            });

            this.save();
            this.render();

            let message = `${newItems} itens adicionados à BlackList!`;
            if (duplicatesSkipped > 0) {
                message += ` (${duplicatesSkipped} duplicados ignorados)`;
            }
            App.showToast(message, 'success');

        } catch (error) {
            console.error(error);
            App.showToast('Erro ao importar arquivo', 'error');
        }

        document.getElementById('importBlacklist').value = '';
    },

    clearAll() {
        if (!confirm('Deseja realmente limpar toda a BlackList?')) {
            return;
        }

        this.data = [];
        this.save();
        this.render();
        App.showToast('BlackList limpa com sucesso!', 'success');
    },

    addItem() {
        const codeInput = document.getElementById('blacklistCode');
        const descInput = document.getElementById('blacklistDesc');

        const codigo = codeInput.value.trim().toUpperCase();
        const descricao = descInput.value.trim();

        if (!codigo) {
            App.showToast('Informe o código do produto', 'warning');
            codeInput.focus();
            return;
        }

        if (this.data.some(item => item.codigo === codigo)) {
            App.showToast('Este item já está na BlackList', 'warning');
            return;
        }

        this.data.push({
            id: Date.now(),
            codigo: codigo,
            descricao: descricao,
            naoSep: true, // Default for new items
            talvez: false,
            dataInclusao: new Date().toLocaleDateString('pt-BR')
        });

        this.save();
        this.render();

        codeInput.value = '';
        descInput.value = '';
        codeInput.focus();

        App.showToast('Item adicionado à BlackList', 'success');
    },

    removeItem(id) {
        this.data = this.data.filter(item => item.id !== id);
        this.save();
        this.render();
        App.showToast('Item removido da BlackList', 'success');
    },

    save() {
        Storage.save(Storage.KEYS.BLACKLIST, this.data);
    },

    isBlacklisted(codigo) {
        return this.data.some(item => item.codigo === codigo.toUpperCase());
    },

    getBlacklistedData() {
        return this.data;
    },

    getBlacklistedCodes() {
        return this.data.filter(item => item.naoSep).map(item => item.codigo);
    },

    toggleField(id, field) {
        const item = this.data.find(i => i.id === id);
        if (item) {
            item[field] = !item[field];

            // If marking as Talvez, also mark as Não Sep by default
            if (field === 'talvez' && item.talvez) {
                item.naoSep = true;
            }

            this.save();
            this.render();
        }
    },

    render() {
        if (this.data.length === 0) {
            this.tableBody.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.tableBody.innerHTML = this.data.map(item => `
            <tr>
                <td>${item.codigo}</td>
                <td>${item.descricao || '-'}</td>
                <td class="center">
                    <input type="checkbox" ${item.naoSep ? 'checked' : ''} 
                           onchange="Blacklist.toggleField(${item.id}, 'naoSep')">
                </td>
                <td class="center">
                    <input type="checkbox" ${item.talvez ? 'checked' : ''} 
                           onchange="Blacklist.toggleField(${item.id}, 'talvez')">
                </td>
                <td>${item.dataInclusao}</td>
                <td>
                    <button class="btn-delete" onclick="Blacklist.removeItem(${item.id})">
                        🗑️ Remover
                    </button>
                </td>
            </tr>
        `).join('');
    }
};
