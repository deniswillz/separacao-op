
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
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];

        const opsMap: { [key: string]: PendingOP } = {};
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
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border flex justify-between items-center shadow-sm">
        <h2 className="text-base font-black text-gray-800 uppercase">Geração de Lotes Individual</h2>
        <div className="flex gap-3">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2 bg-gray-100 rounded-xl text-[10px] font-black uppercase hover:bg-gray-200 transition-all">Importar Excel</button>
          <button onClick={handleGenerateList} disabled={selectedIds.length === 0 || !globalWarehouse} className="px-6 py-2 bg-[#004D33] text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-50 active:scale-95">Gerar Listas ({selectedIds.length})</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase mb-4">Configuração Geral</p>
          <select value={globalWarehouse} onChange={e => setGlobalWarehouse(e.target.value)} className="w-full px-4 py-3 bg-gray-50 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 focus:ring-emerald-50">
            <option value="">Selecione o Armazém</option>
            <option value="CHICOTE">CHICOTE</option><option value="MECANICA">MECÂNICA</option><option value="ELETRONICA">ELETRÔNICA</option>
          </select>
        </div>

        <div className="lg:col-span-3 bg-white rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">OP</th>
                <th className="px-6 py-4">ITENS</th>
                <th className="px-6 py-4 text-center">AÇÃO</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs font-bold text-gray-600">
              {ops.map(op => (
                <tr key={op.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-black text-gray-900">{op.id}</td>
                  <td className="px-6 py-4">{op.itens.length} SKU(s)</td>
                  <td className="px-6 py-4 text-center">
                    <input type="checkbox" checked={selectedIds.includes(op.id)} onChange={() => toggleSelect(op.id)} className="w-5 h-5 rounded border-gray-300 text-emerald-600" />
                  </td>
                </tr>
              ))}
              {ops.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-12 text-center text-gray-300 uppercase tracking-tighter">Nenhuma OP importada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Empenhos;
