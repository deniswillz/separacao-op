
import React, { useState, useEffect, useRef } from 'react';
import { UrgencyLevel, User } from '../types';
import * as XLSX from 'xlsx';
import { supabase, upsertBatched } from '../services/supabaseClient';

interface PendingOP {
  id: string;
  data: string;
  itens: { codigo: string; descricao: string; quantidade: number; unidade: string }[];
  prioridade: UrgencyLevel;
}

const Empenhos: React.FC = () => {
  const [ops, setOps] = useState<PendingOP[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [globalWarehouse, setGlobalWarehouse] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const opsMap: { [key: string]: PendingOP } = {};
        // Dados começam na linha 3 (index 2)
        data.slice(2).filter(row => row[0]).forEach(row => {
          const opId = String(row[0]).trim();
          if (!opsMap[opId]) {
            opsMap[opId] = {
              id: opId,
              data: new Date().toLocaleDateString('pt-BR'),
              itens: [],
              prioridade: 'media'
            };
          }
          opsMap[opId].itens.push({
            codigo: String(row[20] || '').trim(),
            descricao: String(row[21] || '').trim(),
            quantidade: Number(row[22]) || 0,
            unidade: String(row[23] || '').trim()
          });
        });

        const importedOps = Object.values(opsMap);
        setOps(prev => [...prev, ...importedOps]);
        setSelectedIds(prev => [...prev, ...importedOps.map(op => op.id)]);
        alert(`${importedOps.length} OPs importadas.`);
      } catch (error: any) {
        alert('Erro: ' + error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleGenerateList = async () => {
    if (selectedIds.length === 0 || !globalWarehouse) return;

    setIsGenerating(true);
    const selectedOps = ops.filter(op => selectedIds.includes(op.id));

    const lotsToInsert = selectedOps.map(op => {
      const formattedItens = op.itens.map(item => ({
        ...item,
        separado: false,
        transferido: false,
        falta: false,
        qtd_separada: 0,
        composicao: [{ op: op.id, quantidade: item.quantidade, concluido: false }]
      }));

      return {
        documento: `OP-${op.id}`,
        nome: op.id,
        armazem: globalWarehouse,
        ordens: [op.id],
        itens: formattedItens,
        status: 'pendente',
        data_criacao: new Date().toISOString()
      };
    });

    try {
      await upsertBatched('separacao', lotsToInsert, 500);

      // TEA Sync: Individual cards for TEA
      const teaRecords = selectedOps.map(op => ({
        documento: op.id,
        armazem: globalWarehouse,
        produto: op.itens[0]?.codigo || 'DIVERSOS',
        descricao: op.itens[0]?.descricao || 'LISTA DE EMPENHOS',
        quantidade: op.itens.reduce((sum, i) => sum + i.quantidade, 0),
        prioridade: 'Média',
        status_atual: 'Aguardando Separação...',
        itens: [{ status: 'Logística', icon: '🏢', data: new Date().toLocaleDateString('pt-BR') }]
      }));

      await upsertBatched('historico', teaRecords, 500);

      alert(`Geradas ${lotsToInsert.length} listas individuais e TEA atualizado.`);
      setOps(prev => prev.filter(op => !selectedIds.includes(op.id)));
      setSelectedIds([]);
    } catch (error: any) {
      alert('Erro ao gerar lista: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Cargas de Empenhos</h2>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
          >
            IMPORTAR EXCEL
          </button>
          <button
            onClick={handleGenerateList}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
            disabled={selectedIds.length === 0 || !globalWarehouse}
          >
            GERAR LISTA SEPARAÇÃO
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow p-6">
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">Armazém Destino</label>
          <select
            value={globalWarehouse}
            onChange={(e) => setGlobalWarehouse(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Selecione...</option>
            <option value="CHICOTE">CHICOTE</option>
            <option value="MECANICA">MECÂNICA</option>
            <option value="ELETRONICA">ELETRÔNICA</option>
          </select>
        </div>

        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OP</th>
              <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Itens</th>
              <th className="px-6 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Selecionar</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ops.map((op) => (
              <tr key={op.id}>
                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{op.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{op.itens.length} itens</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(op.id)}
                    onChange={() => toggleSelect(op.id)}
                    className="h-5 w-5 text-blue-600"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Empenhos;
