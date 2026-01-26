import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import Loading from './Loading';

interface FinishedOP {
  id: string;
  op_range: string;
  armazem: string;
  documento: string;
  nome: string;
  ordens: string[];
  separador: string;
  conferente: string;
  data_finalizacao: string;
  total_itens: number;
  itens: any[];
}

const Historico: React.FC<{ user: User }> = ({ user }) => {
  const [history, setHistory] = useState<FinishedOP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState<FinishedOP | null>(null);
  const [selectedOpFilter, setSelectedOpFilter] = useState<string | null>(null);
  const [showObsModal, setShowObsModal] = useState(false);
  const [obsData, setObsData] = useState<{ item: any; observations: any[] } | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('historico')
      .select('*')
      .neq('armazem', 'TEA')
      .order('id', { ascending: false });
    if (error) console.error(error);
    else if (data) {
      const formattedData = data.map((record: any) => {
        const firstItem = record.itens?.[0] || {};
        const meta = firstItem.metadata || {};
        return {
          ...record,
          op_range: meta.op_range || record.nome || record.documento,
          conferente: meta.conferente || record.conferente || 'N/A',
          separador: meta.separador || record.separador || firstItem.usuario_atual || 'N/A',
          ordens: meta.ordens || record.ordens || [],
          data_finalizacao: meta.data_finalizacao || record.data_finalizacao || record.updated_at || new Date().toISOString(),
          total_itens: meta.total_itens || (Array.isArray(record.itens) ? record.itens.length : 0),
        };
      }).sort((a: any, b: any) => new Date(b.data_finalizacao).getTime() - new Date(a.data_finalizacao).getTime());
      setHistory(formattedData);
      if (data.length > 0) console.log('Colunas detectadas em historico:', Object.keys(data[0]));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    const channel = supabase.channel('historico-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistory)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (isLoading) return <Loading message="Carregando Histórico..." />;

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-secondary)] p-6 rounded-[2rem] border border-[var(--border-light)] shadow-[var(--shadow-sm)]">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-[#111827] uppercase tracking-tight">Histórico de Auditoria</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Registros de conferências finalizadas</p>
        </div>
        <div className="relative w-full md:w-96 group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none transition-colors group-focus-within:text-emerald-500">🔍</span>
          <input
            type="text"
            placeholder="BUSCAR POR OP, DOC OU ARMAZÉM..."
            className="w-full bg-[var(--bg-inner)] border-none rounded-2xl py-3 pl-12 pr-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-emerald-500/20 transition-all text-[var(--text-primary)]"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {history
          .filter(item => {
            const search = searchText.toLowerCase();
            return (
              item.documento?.toLowerCase().includes(search) ||
              item.op_range?.toLowerCase().includes(search) ||
              item.armazem?.toLowerCase().includes(search) ||
              item.nome?.toLowerCase().includes(search)
            );
          })
          .map((item) => (
            <div key={item.id} className="bg-[var(--bg-secondary)] rounded-2xl border-2 border-emerald-500/10 p-4 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group relative">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-emerald-600">📋</span>
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">FINALIZADO</span>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir histórico ${item.documento}?`)) {
                          await supabase.from('historico').delete().eq('id', item.id);
                          fetchHistory();
                        }
                      }}
                      className="text-[var(--text-muted)] hover:text-red-500 transition-colors font-bold text-base px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-black text-[var(--text-primary)] uppercase leading-tight line-clamp-2 min-h-[32px]">
                    DOC - {item.documento.replace(/^DOC-/, '')}
                  </h4>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{item.nome}</p>
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-2 border-t border-[var(--border-light)] pt-3">
                  <div>
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">Armazém</p>
                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase truncate">{item.armazem}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">Total Itens</p>
                    <p className="text-[10px] font-black text-emerald-600 uppercase">{item.total_itens} UN</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end mt-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">Data Fechamento</p>
                  <p className="text-[10px] font-black text-[var(--text-muted)] italic">
                    {(() => {
                      const dateStr = item.data_finalizacao;
                      const fixedDateStr = (dateStr.includes(' ') && !dateStr.includes('Z') && !dateStr.includes('+'))
                        ? dateStr.replace(' ', 'T') + 'Z'
                        : dateStr;
                      return new Date(fixedDateStr).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                    })()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedItem(item); setSelectedOpFilter(null); }}
                    className="w-10 h-10 bg-[var(--text-primary)] text-[var(--bg-secondary)] rounded-lg flex items-center justify-center text-lg font-black shadow-lg hover:bg-emerald-700 transition-all"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}

        {history.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="text-6xl opacity-10">📋</div>
            <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-[0.4em]">Nenhum registro auditado</p>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedItem(null)}></div>
          <div className="relative bg-[var(--bg-inner)] w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideInUp max-h-[90vh] flex flex-col">
            <div className="bg-[#006B47] px-10 py-6 flex justify-between items-center text-white shrink-0">
              <h2 className="text-xl font-black uppercase tracking-tight">Detalhamento Logístico</h2>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-3xl border border-[var(--border-light)] shadow-sm space-y-3">
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Armazém e Doc</p>
                  <div className="space-y-1">
                    <p className="text-xl font-black text-[var(--text-primary)] uppercase leading-none">{selectedItem.armazem}</p>
                    <p className="text-xs font-bold text-emerald-600 font-mono italic break-all leading-tight">{selectedItem.documento}</p>
                  </div>
                  <div className="pt-2 border-t border-[var(--border-light)]">
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">Filtrar por OP</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedOpFilter(null)}
                        className={`text-[9px] px-2.5 py-1 rounded-lg font-black border transition-all ${!selectedOpFilter ? 'bg-[var(--text-primary)] text-[var(--bg-secondary)] border-[var(--text-primary)] shadow-lg scale-105' : 'bg-[var(--bg-inner)] text-[var(--text-muted)] border-[var(--border-light)] hover:bg-[var(--bg-inner)]/80'}`}
                      >
                        TODAS OP
                      </button>
                      {(selectedItem.ordens || []).sort().map((op: any) => {
                        const simpleOP = op.replace(/^00/, '').replace(/01001$/, '');
                        const isActive = selectedOpFilter === op;
                        return (
                          <button
                            key={op}
                            onClick={() => setSelectedOpFilter(isActive ? null : op)}
                            className={`text-[9px] px-2.5 py-1 rounded-lg font-black border transition-all ${isActive ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-105' : 'bg-[var(--bg-inner)] text-emerald-700 border-[var(--border-light)] hover:bg-emerald-500/10'}`}
                          >
                            {simpleOP}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--bg-secondary)] p-6 rounded-3xl border border-[var(--border-light)] shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Equipe Responsável</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-xs">👤</div>
                      <div>
                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase">Separador</p>
                        <p className="text-[10px] font-black text-[var(--text-primary)] uppercase">{selectedItem.separador || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-xs">🛡️</div>
                      <div>
                        <p className="text-[8px] font-black text-[var(--text-muted)] uppercase">Conferente</p>
                        <p className="text-[10px] font-black text-[var(--text-primary)] uppercase">{selectedItem.conferente || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#003D29] p-6 rounded-3xl shadow-lg shadow-emerald-950/20 space-y-2 text-white">
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Status Auditoria</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black uppercase italic">Finalizado</p>
                      <span className="text-emerald-400">✅</span>
                    </div>
                    <p className="text-[10px] font-medium text-[var(--text-muted)] font-mono italic opacity-60">
                      {(() => {
                        const dateStr = selectedItem.data_finalizacao;
                        const fixedDateStr = (dateStr.includes(' ') && !dateStr.includes('Z') && !dateStr.includes('+'))
                          ? dateStr.replace(' ', 'T') + 'Z'
                          : dateStr;
                        return new Date(fixedDateStr).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                      })()} (BRT)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-[2rem] border border-[var(--border-light)] shadow-sm overflow-hidden">
                <table className="w-full text-left bg-[var(--bg-secondary)]">
                  <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Código</th>
                      <th className="px-8 py-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Descrição</th>
                      <th className="px-8 py-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-center">Qtd Sol.</th>
                      <th className="px-8 py-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-center">Qtd Sep.</th>
                      <th className="px-8 py-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-center">OBS 🗨️</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-light)]">
                    {selectedItem.itens
                      .filter((item: any) => {
                        const hasQtd = (item.quantidade || 0) > 0;
                        if (!hasQtd) return false;
                        if (!selectedOpFilter) return true;
                        return (item.composicao || []).some((c: any) => c.op === selectedOpFilter);
                      })
                      .map((item: any, idx: number) => {
                        // Consolidate observations from all composition items relevant to this document
                        const observations = (item.composicao || [])
                          .filter((c: any) => c.observacao)
                          .map((c: any) => ({ op: c.op, text: c.observacao }));

                        // Calculate quantities based on active filter
                        let solQty = 0;
                        let sepQty = 0;

                        if (selectedOpFilter) {
                          const relevantComp = (item.composicao || []).find((c: any) => c.op === selectedOpFilter);
                          if (relevantComp) {
                            solQty = relevantComp.quantidade_original || relevantComp.quantidade || 0;
                            sepQty = relevantComp.qtd_separada || 0;
                          }
                        } else {
                          // Total Sum for "Todas OP"
                          solQty = (item.composicao || []).reduce((acc: number, c: any) => acc + (c.quantidade_original || c.quantidade || 0), 0) || item.original_solicitado || item.quantidade;
                          sepQty = (item.composicao || []).reduce((acc: number, c: any) => acc + (c.qtd_separada || 0), 0) || item.quantidade;
                        }

                        return (
                          <tr key={idx} className="hover:bg-[var(--bg-inner)]/30 transition-colors">
                            <td className="px-8 py-6 font-black text-emerald-600 text-sm font-mono tracking-tighter w-1/4">{item.codigo}</td>
                            <td className="px-8 py-6 text-xs font-black text-[var(--text-primary)] uppercase tracking-tight">{item.descricao}</td>
                            <td className="px-8 py-6 text-center text-[11px] font-black text-[var(--text-muted)] font-mono italic">
                              {solQty}
                            </td>
                            <td className="px-8 py-6 text-center text-sm font-black text-[var(--text-primary)] font-mono">
                              {sepQty}
                            </td>
                            <td className="px-8 py-6 text-center">
                              <button
                                onClick={() => {
                                  setObsData({ item, observations });
                                  setShowObsModal(true);
                                }}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all ${observations.length > 0 ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' : 'bg-gray-50 text-gray-200'}`}
                              >
                                🗨️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-10 bg-[var(--bg-secondary)] border-t border-[var(--border-light)] flex justify-end gap-4 shrink-0">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-10 py-4 bg-[var(--bg-secondary)] border-2 border-[var(--border-light)] text-[var(--text-muted)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-inner)] transition-all active:scale-95"
              >
                Sair
              </button>
              <button className="px-10 py-4 bg-[#006B47] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/10 flex items-center gap-3 hover:bg-[#005538] transition-all active:scale-95">
                <span>📥</span> Exportar Relatório
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIXED: Rendering the Modal */}
      <ObservationsModal
        isOpen={showObsModal}
        onClose={() => setShowObsModal(false)}
        data={obsData}
      />
    </div>
  );
};

const ObservationsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  data: { item: any; observations: any[] } | null;
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-[var(--bg-secondary)] w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideInUp flex flex-col max-h-[80vh]">
        <div className="bg-[#111827] px-8 py-5 flex justify-between items-center text-white shrink-0">
          <div className="space-y-0.5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Log de Observações</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase truncate max-w-[250px]">{data.item.codigo}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20">✕</button>
        </div>
        <div className="p-8 space-y-4 overflow-y-auto custom-scrollbar bg-[var(--bg-inner)]/30">
          {data.observations.length === 0 ? (
            <div className="py-20 text-center space-y-3 opacity-20">
              <span className="text-4xl">🗨️</span>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Nenhuma nota para este item</p>
            </div>
          ) : (
            data.observations.map((obs, idx) => {
              const isLatest = idx === data.observations.length - 1;
              return (
                <div key={idx} className={`bg-[var(--bg-secondary)] p-5 rounded-2xl border shadow-sm space-y-2 transition-all ${isLatest ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20' : 'border-[var(--border-light)]'}`}>
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">OP {obs.op}</p>
                    {isLatest && <span className="text-[8px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">MAIS RECENTE</span>}
                  </div>
                  <p className="text-xs font-bold text-[var(--text-primary)] leading-relaxed italic">"{obs.text}"</p>
                </div>
              );
            })
          )}
        </div>
        <div className="p-6 bg-[var(--bg-secondary)] border-t border-[var(--border-light)] flex justify-center shrink-0">
          <button onClick={onClose} className="px-10 py-3 bg-[var(--text-primary)] text-[var(--bg-secondary)] rounded-xl text-[10px] font-black uppercase tracking-widest">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default Historico;
