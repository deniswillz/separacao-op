
import React, { useState, useRef } from 'react';
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

  // Excel import: A=OP, U=Codigo, V=Descricao, W=Quantidade, X=Unidade. Header linha 2.
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
            codigo: String(row[20] || '').trim(),  // Col U (20)
            descricao: String(row[21] || '').trim(), // Col V (21)
            quantidade: Number(row[22]) || 0,       // Col W (22)
            unidade: String(row[23] || '').trim()   // Col X (23)
          });
        });

        const importedOps = Object.values(opsMap);
        setOps(prev => [...prev, ...importedOps]);
        setSelectedIds(prev => [...prev, ...importedOps.map(op => op.id)]);
        alert(`${importedOps.length} OPs importadas com sucesso!`);
      } catch (error: any) {
        alert('Erro ao processar Excel: ' + error.message);
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

    // Consolidate Items from multiple OPs into a single Lot
    const consolidationMap: { [key: string]: any } = {};

    selectedOps.forEach(op => {
      op.itens.forEach(item => {
        if (!consolidationMap[item.codigo]) {
          consolidationMap[item.codigo] = {
            codigo: item.codigo,
            descricao: item.descricao,
            quantidade: 0,
            unidade: item.unidade,
            separado: false,
            transferido: false,
            falta: false,
            // Breakdown for splitting manually later (The "Lupa" view)
            composicao: []
          };
        }
        consolidationMap[item.codigo].quantidade += item.quantidade;
        consolidationMap[item.codigo].composicao.push({
          op: op.id,
          quantidade: item.quantidade,
          concluido: false
        });
      });
    });

    const consolidatedItens = Object.values(consolidationMap);

    // NOVO FORMATO DE NOME DE LOTE (RESUMIDO)
    let lotName = '';
    const extractShortOP = (opId: string) => opId.length >= 7 ? opId.slice(2, 6) : opId;

    if (selectedIds.length === 1) {
      lotName = `OP ${extractShortOP(selectedIds[0])}`;
    } else {
      const sortedIds = [...selectedIds].sort();
      const firstShort = extractShortOP(sortedIds[0]);
      const lastShort = extractShortOP(sortedIds[sortedIds.length - 1]);
      lotName = `OP ${firstShort} até ${lastShort}`;
    }

    const lotId = `LOTE-${new Date().getTime().toString().slice(-6)}`;

    const lotData = [{
      documento: lotId,
      nome: lotName,
      armazem: globalWarehouse,
      ordens: selectedIds, // Array of original OPs
      itens: consolidatedItens,
      status: 'pendente',
      data_criacao: new Date().toISOString(),
      usuario_atual: null
    }];

    try {
      await upsertBatched('separacao', lotData, 500);
      alert(`Lote ${lotId} gerado com ${selectedOps.length} OPs e ${consolidatedItens.length} itens únicos!`);
      // Clear selected ops after generation
      setOps(prev => prev.filter(op => !selectedIds.includes(op.id)));
      setSelectedIds([]);
    } catch (error: any) {
      alert('Erro ao gerar lote: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["RELATÓRIO DE ORDENS"],
      ["Ordem Produção", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Produto", "Descrição", "Quantidade", "Unidade"],
      ["00662701001", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "PA0902000000026", "CABO DE 14 LINHAS", "5", "PC"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_empenhos.xlsx");
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Botões de Ação Superiores */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <h2 className="text-sm font-black text-gray-700 uppercase tracking-tight">
            SELECIONE AS ORDENS DE PRODUÇÃO
          </h2>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadModelo}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all">
              <span className="text-base">📄</span> MODELO
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className={`flex items-center gap-2 px-4 py-2 bg-[#004d33] text-white rounded-xl text-xs font-bold hover:bg-[#003624] transition-all ${isImporting ? 'opacity-50' : ''}`}
            >
              <span className="text-base">📥</span> {isImporting ? 'PROCES...' : 'IMPORTAR (A,U,V,W,X)'}
            </button>
            <button
              onClick={handleGenerateList}
              disabled={selectedIds.length === 0 || !globalWarehouse || isGenerating}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedIds.length > 0 && globalWarehouse && !isGenerating
                ? 'bg-[#10b981] text-white hover:bg-[#059669]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
            >
              <span className="text-base">{isGenerating ? '⏳' : '✅'}</span>
              {isGenerating ? 'GERANDO...' : 'GERAR LISTA'}
            </button>
            <button
              onClick={() => { setSelectedIds([]); setOps([]); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#ef4444] text-white rounded-xl text-xs font-bold hover:bg-[#dc2626] transition-all"
            >
              <span className="text-base">🗑️</span> LIMPAR
            </button>
          </div>
        </div>

        {isGenerating && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
            <div className="w-10 h-10 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse">Processando Ordens...</p>
          </div>
        )}

        {/* Grid de OPs */}
        <div className="mt-6 relative">
          <div className="max-h-48 overflow-y-auto pr-4 custom-scrollbar border border-gray-100 rounded-2xl p-4 bg-gray-50/30">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {ops.map((op) => (
                <button
                  key={op.id}
                  onClick={() => toggleSelect(op.id)}
                  className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all text-center flex items-center justify-center gap-1 ${selectedIds.includes(op.id)
                    ? 'bg-white border-emerald-500 text-emerald-700 shadow-sm ring-2 ring-emerald-500/10'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                >
                  <span className="tracking-tighter">{op.id}</span>
                </button>
              ))}
            </div>
            <div className="absolute top-0 right-0 w-1.5 h-full bg-[#006B47] rounded-full"></div>
          </div>
          {ops.length > 0 && (
            <p className="text-[10px] font-black text-emerald-600 mt-3 flex items-center gap-2 uppercase tracking-widest">
              ✨ {selectedIds.length === ops.length ? 'Todas as OPs selecionadas' : `${selectedIds.length} selecionadas`}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm h-fit space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Armazém (Destino)</label>
            <select
              value={globalWarehouse}
              onChange={(e) => setGlobalWarehouse(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
            >
              <option value="">Selecione...</option>
              <option value="CHICOTE">CHICOTE</option>
              <option value="MECANICA">MECÂNICA</option>
              <option value="ELETRONICA">ELETRÔNICA</option>
            </select>
          </div>
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-[10px] font-black text-emerald-800 uppercase leading-relaxed">
              Dica: O armazém selecionado será aplicado a todo o lote de separação.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-6 py-4">📋 ORDEM DE PRODUÇÃO</th>
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4 text-center">Prioridade (Editável)</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ops.filter(op => selectedIds.includes(op.id)).map((op) => (
                  <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-black text-gray-800 tracking-tighter">{op.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-gray-400">{op.data}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <select
                          value={op.prioridade}
                          onChange={(e) => handlePriorityChange(op.id, e.target.value as UrgencyLevel)}
                          className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-center cursor-pointer ${op.prioridade === 'urgencia' ? 'bg-red-50 text-red-600 border-red-200' :
                            op.prioridade === 'alta' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                        >
                          <option value="baixa">Baixa</option>
                          <option value="media">Média</option>
                          <option value="alta">Alta</option>
                          <option value="urgencia">Urgência</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all text-xs font-bold">Adc +</button>
                        <button
                          onClick={() => toggleSelect(op.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          Excluir 🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedIds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-xs font-black uppercase tracking-widest">
                      Selecione OPs acima para configurar a separação
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
