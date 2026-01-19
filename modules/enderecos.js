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

            // Debug: show column headers from first row
            if (rawData.length > 0) {
                const headers = Object.keys(rawData[0]);
                console.log(`📋 Colunas encontradas no Excel:`, headers);
                console.log(`📋 Primeira linha:`, rawData[0]);
            }

            // Ask user if they want to replace all data or add to existing
            const existingCount = this.data.length;
            let shouldReplace = true; // Default to replace for fresh import

            if (existingCount > 0) {
                shouldReplace = confirm(
                    `Você tem ${existingCount} endereços cadastrados.\n\n` +
                    `Deseja SUBSTITUIR todos por ${rawData.length} itens do Excel?\n\n` +
                    `• OK = Substituir tudo\n` +
                    `• Cancelar = Adicionar apenas novos itens`
                );
            }

            if (shouldReplace || existingCount === 0) {
                // Clear existing data
                this.data = [];
                console.log(`🗑️ Dados anteriores limpos. Importando ${rawData.length} novos registros...`);
            }

            const existingCodes = new Set(this.data.map(item => item.codigo.toUpperCase()));
            let duplicatesSkipped = 0;
            let newItems = 0;
            let emptyRows = 0;

            // Helper function to find a value using multiple possible column names
            const getValue = (row, ...keys) => {
                for (const key of keys) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return String(row[key]).trim();
                    }
                }
                // Also try case-insensitive search
                const rowKeys = Object.keys(row);
                for (const searchKey of keys) {
                    const found = rowKeys.find(k => k.toLowerCase() === searchKey.toLowerCase());
                    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') {
                        return String(row[found]).trim();
                    }
                }
                return '';
            };

            rawData.forEach((row, index) => {
                // Try multiple possible column names for codigo
                const codigo = getValue(row,
                    'Codigo', 'codigo', 'CODIGO', 'Código', 'código',
                    'COD', 'cod', 'Cod', 'SKU', 'sku', 'Sku',
                    'Produto', 'produto', 'PRODUTO', 'Item', 'item', 'ITEM'
                ).toUpperCase();

                if (!codigo) {
                    emptyRows++;
                    return;
                }

                if (existingCodes.has(codigo)) {
                    duplicatesSkipped++;
                    return;
                }

                existingCodes.add(codigo);

                // Format armazem - preserve leading zeros if numeric (01, 02, etc)
                let armazemVal = getValue(row,
                    'Armazem', 'armazem', 'ARMAZEM', 'Armazém', 'armazém',
                    'ARM', 'arm', 'Arm', 'Deposito', 'deposito', 'DEPOSITO'
                );
                // If it's a number without leading zero, add it
                if (/^\d$/.test(armazemVal)) {
                    armazemVal = '0' + armazemVal;
                }

                const descricao = getValue(row,
                    'Descricao', 'descricao', 'DESCRICAO', 'Descrição', 'descrição',
                    'DESC', 'desc', 'Desc', 'Nome', 'nome', 'NOME'
                );

                const endereco = getValue(row,
                    'Endereco', 'endereco', 'ENDERECO', 'Endereço', 'endereço',
                    'END', 'end', 'End', 'Localizacao', 'localizacao', 'LOCALIZACAO',
                    'Local', 'local', 'LOCAL'
                );

                this.data.push({
                    // Use smaller IDs to fit within Supabase integer type (max ~2.1 billion)
                    // Generate unique ID: random base + index
                    id: Math.floor(Math.random() * 2000000000) + index + 1,
                    codigo: codigo,
                    descricao: descricao,
                    endereco: endereco,
                    armazem: armazemVal
                });

                newItems++;
            });

            console.log(`📊 Importação: ${newItems} novos, ${duplicatesSkipped} duplicados, ${emptyRows} linhas sem código`);

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
