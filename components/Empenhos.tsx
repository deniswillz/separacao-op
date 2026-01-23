
import React, { useState } from 'react';
import { UrgencyLevel } from '../types';

interface PendingOP {
  id: string;
  data: string;
  itens: number;
  prioridade: UrgencyLevel;
  armazem?: string;
}

const mockImported: PendingOP[] = Array.from({ length: 18 }, (_, i) => ({
  id: `00653${70 + i}01001`,
  data: '22/01/2026',
  itens: Math.floor(Math.random() * 20) + 1,
  prioridade: 'media'
}));

const Empenhos: React.FC = () => {
  const [ops, setOps] = useState<PendingOP[]>(mockImported);
  const [selectedIds, setSelectedIds] = useState<string[]>(mockImported.slice(0, 15).map(o => o.id));
  const [globalWarehouse, setGlobalWarehouse] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleRemove = (id: string) => {
    setOps(prev => prev.filter(op => op.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handlePriorityChange = (id: string, newPriority: UrgencyLevel) => {
    setOps(prev => prev.map(op => op.id === id ? { ...op, prioridade: newPriority } : op));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Botões de Ação Superiores */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <h2 className="text-sm font-black text-gray-700 uppercase tracking-tight">
            SELECIONE AS ORDENS DE PRODUÇÃO
          </h2>
          
          <div className="flex flex-wrap gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all">
              <span className="text-base">📄</span> Baixar Modelo Excel
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#004d33] text-white rounded-xl text-xs font-bold hover:bg-[#003624] transition-all">
              <span className="text-base">📥</span> Importar Ordens (Excel)
            </button>
            <button 
              disabled={selectedIds.length === 0 || !globalWarehouse}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedIds.length > 0 && globalWarehouse 
                ? 'bg-[#10b981] text-white hover:bg-[#059669]' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <span className="text-base">✅</span> Gerar Lista de Separação
            </button>
            <button 
              onClick={() => { setSelectedIds([]); setOps([]); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#ef4444] text-white rounded-xl text-xs font-bold hover:bg-[#dc2626] transition-all"
            >
              <span className="text-base">🗑️</span> Limpar Tudo
            </button>
          </div>
        </div>

        {/* Grid de Cápsulas (Conforme Imagem) */}
        <div className="mt-6 relative">
          <div className="max-h-48 overflow-y-auto pr-4 custom-scrollbar border border-gray-100 rounded-2xl p-4 bg-gray-50/30">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {ops.map((op) => (
                <button
                  key={op.id}
                  onClick={() => toggleSelect(op.id)}
                  className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all text-center flex items-center justify-center gap-1 ${
                    selectedIds.includes(op.id)
                    ? 'bg-white border-emerald-500 text-emerald-700 shadow-sm ring-2 ring-emerald-500/10'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="tracking-tighter">{op.id}</span>
                </button>
              ))}
            </div>
            {/* Indicador Lateral Verde da Imagem */}
            <div className="absolute top-0 right-0 w-1.5 h-full bg-[#006B47] rounded-full"></div>
          </div>
          {ops.length > 0 && (
             <p className="text-[10px] font-black text-emerald-600 mt-3 flex items-center gap-2 uppercase tracking-widest">
                ✨ {selectedIds.length === ops.length ? 'Todas as OPs já foram selecionadas' : `${selectedIds.length} OPs selecionadas para empenho`}
             </p>
          )}
        </div>
      </div>

      {/* Controles de Destino e Tabela Detalhada */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lado Esquerdo: Configuração Global */}
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

        {/* Lado Direito: Lista de Priorização e Ações */}
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
                          className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-center cursor-pointer ${
                            op.prioridade === 'urgencia' ? 'bg-red-50 text-red-600 border-red-200' :
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
