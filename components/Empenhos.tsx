
import React, { useState, useEffect, useRef } from 'react';
import { UrgencyLevel } from '../types';
import * as XLSX from 'xlsx';
import { supabase, upsertBatched } from '../services/supabaseClient';

interface PendingOP {
  id: string;
  data: string;
  itens: { codigo: string; descricao: string; quantidade: number; unidade: string; observacao?: string }[];
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
        // Data starts at row 3 (index 2)
        data.slice(2).filter(row => row[0]).forEach(row => {
          const opId = String(row[0]).trim(); // Coluna A
          if (!opsMap[opId]) {
            opsMap[opId] = {
              id: opId,
              data: new Date().toLocaleDateString('pt-BR'),
              itens: [],
              prioridade: 'media'
            };
          }
          opsMap[opId].itens.push({
            codigo: String(row[20] || '').trim(), // Coluna U
            descricao: String(row[21] || '').trim(), // Coluna V
            quantidade: Number(row[22]) || 0, // Coluna W
            unidade: 'UN',
            observacao: String(row[23] || '').trim() // Coluna X
          });
        });

        const importedOps = Object.values(opsMap);
        setOps(prev => [...prev, ...importedOps]);
        setSelectedIds(prev => [...prev, ...importedOps.map(op => op.id)]);
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

    // Consolidate Items
    const consolidatedMap: { [key: string]: any } = {};
    selectedOps.forEach(op => {
      op.itens.forEach(item => {
        if (!consolidatedMap[item.codigo]) {
          consolidatedMap[item.codigo] = {
            ...item,
            separado: false,
            transferido: false,
            falta: false,
            ok: false,
            lupa: false,
            tr: false,
            qtd_separada: 0,
            composicao: []
          };
        }
        consolidatedMap[item.codigo].composicao.push({
          op: op.id,
          quantidade: item.quantidade,
          separado: 0, // Individual quantity separated for this OP
          concluido: false,
          observacao: item.observacao || ''
        });
      });
    });

    // Sum total quantities for consolidated items and format correctly
    const formattedItens = Object.values(consolidatedMap).map(item => {
      const totalQtd = item.composicao.reduce((sum: number, c: any) => sum + c.quantidade, 0);
      return {
        codigo: item.codigo,
        descricao: item.descricao,
        quantidade: totalQtd,
        unidade: item.unidade,
        observacao: item.observacao || '',
        separado: false,
        transferido: false,
        falta: false,
        ok: false,
        lupa: false,
        tr: false,
        qtd_separada: 0,
        composicao: item.composicao
      };
    });

    const maxUrgency = selectedOps.some(o => o.prioridade === 'urgencia') ? 'urgencia' :
      selectedOps.some(o => o.prioridade === 'alta') ? 'alta' : 'media';

    const lotName = selectedOps.length > 1
      ? `Lote-${selectedOps[0].id.slice(-4)}-G${selectedOps.length}`
      : `OP-${selectedOps[0].id}`;

    const lotToInsert = {
      documento: lotName,
      nome: lotName,
      armazem: globalWarehouse,
      ordens: selectedOps.map(op => op.id),
      itens: formattedItens,
      status: 'pendente',
      urgencia: maxUrgency,
      data_criacao: new Date().toISOString()
    };

    try {
      await upsertBatched('separacao', [lotToInsert], 900);

      // TEA Sync: Individual cards for TEA
      const teaRecords = selectedOps.map(op => ({
        documento: op.id,
        nome: op.id,
        armazem: globalWarehouse,
        itens: [{
          status: 'Logística',
          icon: '🏢',
          data: new Date().toLocaleDateString('pt-BR'),
          produto: op.itens[0]?.codigo || 'DIVERSOS',
          descricao: op.itens[0]?.descricao || 'INÍCIO LOGÍSTICA',
          quantidade: op.itens.reduce((sum, i) => sum + i.quantidade, 0),
          observacao: op.itens[0]?.observacao || ''
        }]
      }));

      await upsertBatched('historico', teaRecords, 900);

      alert(`Sucesso! Gerado 1 lote consolidado para as OPs selecionadas.`);
      setOps(prev => prev.filter(op => !selectedIds.includes(op.id)));
      setSelectedIds([]);
    } catch (error: any) {
      alert('Erro ao gerar lista: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateOpPriority = (id: string, prio: UrgencyLevel) => {
    setOps(prev => prev.map(op => op.id === id ? { ...op, prioridade: prio } : op));
  };


  const removeOp = (id: string) => {
    setOps(prev => prev.filter(op => op.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Empenhos</h1>
        <div className="text-[10px] font-bold text-gray-400 uppercase">
          Data do Sistema: <span className="text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <h2 className="text-xs font-black text-gray-600 uppercase tracking-widest">Selecione as Ordens de Produção</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { }} className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[9px] font-black uppercase text-gray-500 flex items-center gap-2 hover:bg-gray-50 transition-all">
              📄 Baixar Modelo Excel
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="px-5 py-2.5 bg-[#004D33] text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all">
              🕹️ {isImporting ? 'Importando...' : 'Importar Ordens (Excel)'}
            </button>
            <button onClick={handleGenerateList} disabled={selectedIds.length === 0 || !globalWarehouse || isGenerating} className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[9px] font-black uppercase text-gray-400 flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50">
              ✅ {isGenerating ? 'Processando...' : 'Gerar Lista de Separação'}
            </button>
            <button onClick={() => { setOps([]); setSelectedIds([]); }} className="px-5 py-2.5 bg-[#EF4444] text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:opacity-90 transition-all">
              🗑️ Limpar Tudo
            </button>
          </div>
        </div>

        <div className="bg-gray-50/50 p-4 rounded-[2rem] border border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {ops.map((op) => (
              <button
                key={op.id}
                onClick={() => toggleSelect(op.id)}
                className={`px-4 py-3 rounded-xl border-2 text-[10px] font-black transition-all ${selectedIds.includes(op.id)
                  ? 'bg-white border-[#10B981] text-[#10B981] shadow-lg shadow-emerald-50'
                  : 'bg-white border-gray-100 text-gray-300'
                  }`}
              >
                {op.id}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs">✨</span>
          <p className="text-[10px] font-black text-[#10B981] uppercase tracking-widest">
            {selectedIds.length} OPS SELECIONADAS PARA EMPENHO
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Armazém (Destino)</h3>
            <select
              value={globalWarehouse}
              onChange={(e) => setGlobalWarehouse(e.target.value)}
              className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 text-xs font-black text-gray-600 outline-none focus:ring-2 focus:ring-emerald-50 transition-all"
            >
              <option value="">Selecione...</option>
              <option value="CHICOTE">CHICOTE</option>
              <option value="MECANICA">MECÂNICA</option>
              <option value="ELETRONICA">ELETRÔNICA</option>
            </select>
          </div>

          <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 space-y-3">
            <p className="text-[10px] font-black text-[#006B47] uppercase leading-relaxed">
              DICA: O ARMAZÉM SELECIONADO SERÁ APLICADO A TODO O LOTE DE SEPARAÇÃO.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-8 py-6 flex items-center gap-2">📋 ORDEM DE PRODUÇÃO</th>
                  <th className="px-6 py-6 text-center">DATA</th>
                  <th className="px-6 py-6 text-center">PRIORIDADE (EDITÁVEL)</th>
                  <th className="px-8 py-6 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ops.filter(o => selectedIds.includes(o.id)).map((op) => (
                  <tr key={op.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-6 font-black text-[#111827] text-xs">
                      {op.id}
                    </td>
                    <td className="px-6 py-6 text-center text-[10px] font-bold text-gray-400">
                      {op.data}
                    </td>
                    <td className="px-6 py-6 text-center">
                      <select
                        value={op.prioridade}
                        onChange={(e) => updateOpPriority(op.id, e.target.value as UrgencyLevel)}
                        className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase outline-none border-none cursor-pointer transition-all ${op.prioridade === 'urgencia' ? 'bg-red-50 text-red-500' :
                          op.prioridade === 'alta' ? 'bg-orange-50 text-orange-500' :
                            'bg-emerald-50 text-emerald-500'
                          }`}
                      >
                        <option value="media">MÉDIA</option>
                        <option value="alta">ALTA</option>
                        <option value="urgencia">URGÊNCIA</option>
                      </select>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-6">
                        <button className="text-[10px] font-black text-[#10B981] uppercase tracking-tighter hover:opacity-70">Adc +</button>
                        <button onClick={() => removeOp(op.id)} className="flex items-center gap-2 text-[10px] font-black text-[#EF4444] uppercase tracking-tighter hover:opacity-70 transition-all">
                          Excluir 🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedIds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-16 text-center text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">
                      Nenhuma OP selecionada para listagem
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Empenhos;
