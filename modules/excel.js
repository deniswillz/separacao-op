/**
 * Excel Module
 * Handles reading and writing Excel files using SheetJS
 */

const ExcelHelper = {
    /**
     * Read Excel file and return data as array of objects
     */
    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Get first sheet
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];

                    // Convert to JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        defval: ''
                    });

                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Read Excel with headers (first row as keys)
     */
    async readFileWithHeaders(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];

                    // First, read as raw array to detect row structure
                    const rawData = XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        defval: '',
                        blankrows: false
                    });

                    if (rawData.length < 2) {
                        resolve([]);
                        return;
                    }

                    const firstRow = rawData[0];
                    const secondRow = rawData[1];

                    // Count non-empty cells
                    const firstRowNonEmpty = firstRow.filter(v => v !== '' && v !== null && v !== undefined).length;
                    const secondRowNonEmpty = secondRow.filter(v => v !== '' && v !== null && v !== undefined).length;

                    console.log(`📋 Linha 1: ${firstRowNonEmpty} células preenchidas`);
                    console.log(`📋 Linha 2: ${secondRowNonEmpty} células preenchidas`);
                    console.log(`📋 Raw linha 1:`, firstRow.slice(0, 5));
                    console.log(`📋 Raw linha 2:`, secondRow.slice(0, 10));
                    console.log(`📋 Raw linha 3 (dados):`, rawData[2]?.slice(0, 10));

                    // If second row has more content, use row 2 as headers
                    if (secondRowNonEmpty > firstRowNonEmpty && secondRowNonEmpty >= 3) {
                        console.log('📋 Usando linha 2 como cabeçalho (linha 1 parece ser título)');

                        // Get the worksheet range
                        const range = XLSX.utils.decode_range(worksheet['!ref']);

                        // Modify range to start from row 2 (0-indexed = 1)
                        range.s.r = 1; // Start from row 2
                        worksheet['!ref'] = XLSX.utils.encode_range(range);

                        // Now read with the modified range - row 2 becomes headers
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                            defval: '',
                            blankrows: false
                        });

                        console.log(`📋 Lidas ${jsonData.length} linhas de dados`);
                        if (jsonData.length > 0) {
                            console.log(`📋 Primeira linha processada:`, jsonData[0]);
                        }

                        resolve(jsonData);
                        return;
                    }

                    // Default: use first row as headers
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        defval: ''
                    });

                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Export data to Excel file
     */
    exportToExcel(data, filename) {
        try {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');

            // Auto-size columns
            const colWidths = [];
            if (data.length > 0) {
                Object.keys(data[0]).forEach((key, i) => {
                    let maxWidth = key.length;
                    data.forEach(row => {
                        const val = String(row[key] || '');
                        if (val.length > maxWidth) maxWidth = val.length;
                    });
                    colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
                });
                worksheet['!cols'] = colWidths;
            }

            XLSX.writeFile(workbook, `${filename}.xlsx`);
            return true;
        } catch (error) {
            console.error('Erro ao exportar:', error);
            return false;
        }
    },

    /**
     * Normalize header names for consistent access
     */
    normalizeHeaders(data) {
        return data.map(row => {
            const normalized = {};
            Object.entries(row).forEach(([key, value]) => {
                // Remove accents and convert to lowercase
                const normalizedKey = key
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '');
                normalized[normalizedKey] = value;
            });
            return normalized;
        });
    }
};
