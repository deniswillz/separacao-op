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

                    // Convert with headers
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
