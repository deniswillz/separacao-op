/**
 * Cadastro Module
 * Manages product registration list with Armazém column
 */

const Cadastro = {
    data: [],
    tableBody: null,
    emptyState: null,
    searchInput: null,

    init() {
        this.tableBody = document.querySelector('#tableCadastro tbody');
        this.emptyState = document.getElementById('emptyCadastro');
        this.searchInput = document.getElementById('searchCadastro');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.CADASTRO);
        if (saved) {
            this.data = saved;
        }

        // Setup event listeners
        document.getElementById('importCadastro').addEventListener('change', (e) => {
            this.importExcel(e.target.files[0]);
        });

        const btnModelo = document.getElementById('btnModeloCadastro');
        if (btnModelo) {
            btnModelo.addEventListener('click', () => {
                this.downloadTemplate();
            });
        }

        const btnLimpar = document.getElementById('btnLimparCadastro');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                this.clearAll();
            });
        }

        this.searchInput.addEventListener('input', () => {
            this.render();
        });

        this.render();
    },

    downloadTemplate() {
        const templateData = [
            { 'Codigo': 'EXEMPLO001', 'Descricao': 'Produto Exemplo 1', 'Unidade': 'UN', 'Armazem': 'CHICOTE' },
            { 'Codigo': 'EXEMPLO002', 'Descricao': 'Produto Exemplo 2', 'Unidade': 'PC', 'Armazem': 'MECANICA' },
            { 'Codigo': 'EXEMPLO003', 'Descricao': 'Produto Exemplo 3', 'Unidade': 'KG', 'Armazem': 'ELETRONICA' }
        ];

        ExcelHelper.exportToExcel(templateData, 'Modelo_Cadastro');
        App.showToast('Modelo Excel baixado!', 'success');
    },

    clearAll() {
        if (!confirm('Deseja realmente excluir todos os itens do cadastro?')) {
            return;
        }

        this.data = [];
        this.save();
        this.render();
        App.showToast('Cadastro limpo com sucesso!', 'success');
    },

    deleteItem(id) {
        this.data = this.data.filter(item => item.id !== id);
        this.save();
        this.render();
        App.showToast('Item excluído!', 'success');
    },

    async importExcel(file) {
        if (!file) return;

        try {
            const rawData = await ExcelHelper.readFileWithHeaders(file);

            const existingCodes = new Set(this.data.map(item => item.codigo.toUpperCase()));
            let duplicatesSkipped = 0;
            let newItems = 0;

            rawData.forEach((row, index) => {
                const codigo = String(row.Codigo || row.codigo || row.CODIGO || row['Código'] || '').trim().toUpperCase();

                if (!codigo) return;

                if (existingCodes.has(codigo)) {
                    duplicatesSkipped++;
                    return;
                }

                existingCodes.add(codigo);

                this.data.push({
                    id: Date.now() + index,
                    codigo: codigo,
                    descricao: row.Descricao || row.descricao || row.DESCRICAO || row['Descrição'] || '',
                    unidade: row.Unidade || row.unidade || row.UNIDADE || row.UN || 'UN',
                    armazem: row.Armazem || row.armazem || row.ARMAZEM || row['Armazém'] || ''
                });

                newItems++;
            });

            this.save();
            this.render();

            let message = `${newItems} produtos importados!`;
            if (duplicatesSkipped > 0) {
                message += ` (${duplicatesSkipped} duplicados ignorados)`;
            }
            App.showToast(message, 'success');

        } catch (error) {
            console.error(error);
            App.showToast('Erro ao importar arquivo', 'error');
        }

        document.getElementById('importCadastro').value = '';
    },

    save() {
        Storage.save(Storage.KEYS.CADASTRO, this.data);
    },

    render() {
        const searchTerm = this.searchInput.value.toLowerCase();

        const filtered = this.data.filter(item =>
            item.codigo.toLowerCase().includes(searchTerm) ||
            item.descricao.toLowerCase().includes(searchTerm) ||
            (item.armazem && item.armazem.toLowerCase().includes(searchTerm))
        );

        // Update counter
        this.updateCounter();

        if (filtered.length === 0) {
            this.tableBody.innerHTML = '';
            this.emptyState.classList.add('show');
            return;
        }

        this.emptyState.classList.remove('show');

        this.tableBody.innerHTML = filtered.map(item => `
            <tr>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.unidade}</td>
                <td>${item.armazem || '-'}</td>
                <td>
                    <button class="btn-delete" onclick="Cadastro.deleteItem(${item.id})">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `).join('');
    },

    updateCounter() {
        const counter = document.getElementById('countCadastro');
        if (counter) {
            const total = this.data.length;
            counter.textContent = `${total.toLocaleString('pt-BR')} ${total === 1 ? 'item' : 'itens'}`;
        }
    },

    getData() {
        return this.data;
    },

    getDescricao(codigo) {
        const item = this.data.find(i => i.codigo.toUpperCase() === codigo.toUpperCase());
        return item ? item.descricao : null;
    }
};
