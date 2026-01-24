
import React, { useState, useEffect, useRef } from 'react';
import { UrgencyLevel, User } from '../types';
import * as XLSX from 'xlsx';
import { supabase, upsertBatched } from '../services/supabaseClient';

interface PendingOP {
  id: string;
  data: string;
  itens: { codigo: string; descricao: string; quantidade: number; unidade: string }[];
  prioridade: UrgencyLevel;
  armazem?: string;
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

  const handlePriorityChange = (id: string, newPriority: UrgencyLevel) => {
    setOps(prev => prev.map(op => op.id === id ? { ...op, prioridade: newPriority } : op));
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

    // NOVA SOLICITAÇÃO: Gerar Cards Individuais por OP
    const lotsToInsert = selectedOps.map(op => {
      const lotId = `OP-${op.id}`;
      // Formata itens para o padrão do banco
      const formattedItens = op.itens.map(item => ({
        ...item,
        separado: false,
        transferido: false,
        falta: false,
        composicao: [{ op: op.id, quantidade: item.quantidade, concluido: false }]
      }));

      return {
        documento: lotId,
        nome: op.id,
        armazem: globalWarehouse,
        ordens: [op.id],
        itens: formattedItens,
        status: 'pendente',
        data_criacao: new Date().toISOString(),
        usuario_atual: null
      };
    });

    try {
      await upsertBatched('separacao', lotsToInsert, 500);

      // TEA INTEGRATION: Usando colunas existentes ('documento' e 'itens' p/ fluxo?)
      // NOTA: 'op' e 'fluxo' faltam no banco, usando 'documento' e 'itens' (JSON)
      const teaRecords = selectedOps.map(op => ({
        documento: op.id,
        armazem: globalWarehouse,
        produto: op.itens[0]?.codigo || 'PA0000000', // Pega o primeiro como referência do card
        descricao: op.itens[0]?.descricao || 'DIVERSOS',
        quantidade: op.itens.reduce((sum, i) => sum + i.quantidade, 0),
        prioridade: op.prioridade,
        status_atual: 'Aguardando Separação...',
        itens: [
          { status: 'Logística', icon: '🏢', data: new Date().toLocaleDateString('pt-BR') },
          { status: 'Separação', icon: '✅', data: new Date().toLocaleDateString('pt-BR') }
        ]
      }));
      // Atenção: Upsert em 'historico' pode precisar de 'id' ou 'documento' como conflito
      await upsertBatched('historico', teaRecords, 500);

      alert(`Geradas ${lotsToInsert.length} listas individuais! TEA atualizado.`);
      setOps(prev => prev.filter(op => !selectedIds.includes(op.id)));
      setSelectedIds([]);
    } catch (error: any) {
      alert('Erro: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-6 rounded-2xl border flex flex-col lg:flex-row justify-between items-center gap-4">
        <h2 className="text-sm font-black text-gray-700 uppercase">Selecione Ordens (A,U,V,W,X)</h2>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-[#004d33] text-white rounded-xl text-xs font-bold">IMPORTAR</button>
          <button onClick={handleGenerateList} disabled={selectedIds.length === 0 || !globalWarehouse} className="px-4 py-2 bg-[#10b981] text-white rounded-xl text-xs font-bold">GERAR (INDIVIDUAL)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border space-y-4">
          <select value={globalWarehouse} onChange={e => setGlobalWarehouse(e.target.value)} className="w-full px-4 py-3 bg-gray-50 rounded-2xl text-sm font-bold">
            <option value="">Selecione Armazém...</option>
            <option value="CHICOTE">CHICOTE</option><option value="MECANICA">MECÂNICA</option><option value="ELETRONICA">ELETRÔNICA</option>
          </select>
        </div>
        <div className="lg:col-span-3 bg-white rounded-3xl border overflow-hidden">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50 text-[10px] font-black uppercase"><th className="px-6 py-4">OP</th><th className="px-6 py-4">ITENS</th><th className="px-6 py-4">SELECIONAR</th></tr></thead>
            <tbody className="divide-y">
              {ops.map(op => (
                <tr key={op.id}>
                  <td className="px-6 py-4 font-black">{op.id}</td>
                  <td className="px-6 py-4 text-xs">{op.itens.length} itens</td>
                  <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(op.id)} onChange={() => toggleSelect(op.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Empenhos;
