/**
 * Endereços Module
 * Manages product locations in warehouse
 * Armazém replaces Saldo
 */

const Enderecos = {
    data: [],
    tableBody: null,
    emptyState: null,
    searchInput: null,

    init() {
        this.tableBody = document.querySelector('#tableEnderecos tbody');
        this.emptyState = document.getElementById('emptyEnderecos');
        this.searchInput = document.getElementById('searchEnderecos');

        // Load saved data
        const saved = Storage.load(Storage.KEYS.ENDERECOS);
        if (saved) {
            this.data = saved;
        }

        // Setup event listeners
        document.getElementById('importEnderecos').addEventListener('change', (e) => {
            this.importExcel(e.target.files[0]);
        });

        const btnModelo = document.getElementById('btnModeloEnderecos');
        if (btnModelo) {
            btnModelo.addEventListener('click', () => {
                this.downloadTemplate();
            });
        }

        const btnLimpar = document.getElementById('btnLimparEnderecos');
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
            { 'Codigo': 'EXEMPLO001', 'Descricao': 'Produto Exemplo 1', 'Endereco': 'A-01-01', 'Armazem': 'CHICOTE' },
            { 'Codigo': 'EXEMPLO002', 'Descricao': 'Produto Exemplo 2', 'Endereco': 'B-02-03', 'Armazem': 'MECANICA' },
            { 'Codigo': 'EXEMPLO003', 'Descricao': 'Produto Exemplo 3', 'Endereco': 'C-01-02', 'Armazem': 'ELETRONICA' }
        ];

        ExcelHelper.exportToExcel(templateData, 'Modelo_Enderecos');
        App.showToast('Modelo Excel baixado!', 'success');
    },

    clearAll() {
        if (!confirm('Deseja realmente excluir todos os endereços?')) {
            return;
        }

        this.data = [];
        this.save();
        this.render();
        App.showToast('Endereços limpos com sucesso!', 'success');
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
            console.log(`📊 Excel: ${rawData.length} linhas lidas do arquivo`);

            // Ask user if they want to replace all data or add to existing
            const existingCount = this.data.length;
            let shouldReplace = false;

            if (existingCount > 0) {
                shouldReplace = confirm(
                    `Você tem ${existingCount} endereços cadastrados.\n\n` +
                    `Deseja SUBSTITUIR todos por ${rawData.length} itens do Excel?\n\n` +
                    `• OK = Substituir tudo\n` +
                    `• Cancelar = Adicionar apenas novos itens`
                );
            }

            if (shouldReplace) {
                // Clear existing data
                this.data = [];
                console.log(`🗑️ Dados anteriores limpos. Importando ${rawData.length} novos registros...`);
            }

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

                // Format armazem - preserve leading zeros if numeric (01, 02, etc)
                let armazemVal = row.Armazem || row.armazem || row.ARMAZEM || row['Armazém'] || '';
                armazemVal = String(armazemVal).trim();
                // If it's a number without leading zero, add it
                if (/^\d$/.test(armazemVal)) {
                    armazemVal = '0' + armazemVal;
                }

                this.data.push({
                    id: Date.now() + index,
                    codigo: codigo,
                    descricao: row.Descricao || row.descricao || row.DESCRICAO || row['Descrição'] || '',
                    endereco: row.Endereco || row.endereco || row.ENDERECO || row['Endereço'] || '',
                    armazem: armazemVal
                });

                newItems++;
            });

            console.log(`📊 Importação: ${newItems} novos, ${duplicatesSkipped} duplicados ignorados`);

            this.save();
            this.render();

            console.log(`✅ Endereços importados: ${this.data.length} total após importação`);

            let message = `${newItems} endereços importados!`;
            if (duplicatesSkipped > 0) {
                message += ` (${duplicatesSkipped} duplicados ignorados)`;
            }
            App.showToast(message, 'success');

        } catch (error) {
            console.error(error);
            App.showToast('Erro ao importar arquivo', 'error');
        }

        document.getElementById('importEnderecos').value = '';
    },

    save() {
        Storage.save(Storage.KEYS.ENDERECOS, this.data);
    },

    render() {
        const searchTerm = this.searchInput.value.toLowerCase();

        const filtered = this.data.filter(item =>
            item.codigo.toLowerCase().includes(searchTerm) ||
            item.descricao.toLowerCase().includes(searchTerm) ||
            item.endereco.toLowerCase().includes(searchTerm) ||
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
                <td>${item.endereco}</td>
                <td>${item.armazem || '-'}</td>
                <td>
                    <button class="btn-delete" onclick="Enderecos.deleteItem(${item.id})">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `).join('');
    },

    updateCounter() {
        const counter = document.getElementById('countEnderecos');
        if (counter) {
            const total = this.data.length;
            counter.textContent = `${total.toLocaleString('pt-BR')} ${total === 1 ? 'item' : 'itens'}`;
        }
    },

    getEndereco(codigo) {
        const item = this.data.find(e => e.codigo.toUpperCase() === codigo.toUpperCase());
        return item ? item.endereco : '';
    },

    getEnderecoInfo(codigo) {
        const item = this.data.find(e => e.codigo.toUpperCase() === codigo.toUpperCase());
        return item ? { endereco: item.endereco, armazem: item.armazem } : null;
    }
};
