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

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('historico').select('*').order('id', { ascending: false });
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-[#111827] uppercase tracking-tight">Histórico de Auditoria</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Registros de conferências finalizadas</p>
        </div>
        <div className="relative w-full md:w-96 group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none transition-colors group-focus-within:text-emerald-500">🔍</span>
          <input
            type="text"
            placeholder="BUSCAR POR OP, DOC OU ARMAZÉM..."
            className="w-full bg-gray-50 border-none rounded-2xl py-3 pl-12 pr-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-emerald-500/20 transition-all"
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
            <div key={item.id} className="bg-white rounded-2xl border-2 border-emerald-500/10 p-4 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group relative">
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
                      className="text-gray-300 hover:text-red-500 transition-colors font-bold text-base px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter truncate">{item.documento}</p>
                  <h4 className="text-[13px] font-black text-[#111827] uppercase truncate">OP {item.op_range}</h4>
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-2 border-t border-gray-50 pt-3">
                  <div>
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Armazém</p>
                    <p className="text-[10px] font-black text-gray-700 uppercase truncate">{item.armazem}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Itens</p>
                    <p className="text-[10px] font-black text-emerald-600 uppercase">{item.total_itens} UN</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Data Fechamento</p>
                  <p className="text-[10px] font-black text-gray-400 italic">{new Date(item.data_finalizacao).toLocaleDateString('pt-BR')}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(item)}
                  className="w-8 h-8 bg-[#111827] text-white rounded-lg flex items-center justify-center text-lg font-black shadow-lg hover:bg-emerald-700 transition-all"
                >
                  +
                </button>
              </div>
            </div>
          ))}

        {history.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="text-6xl opacity-10">📋</div>
            <p className="text-xs font-black text-gray-200 uppercase tracking-[0.4em]">Nenhum registro auditado</p>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedItem(null)}></div>
          <div className="relative bg-[#F8FAFC] w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideInUp max-h-[90vh] flex flex-col">
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
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Armazém e Doc</p>
                  <div className="space-y-1">
                    <p className="text-lg font-black text-gray-900 uppercase">{selectedItem.armazem}</p>
                    <p className="text-xs font-bold text-emerald-600 font-mono italic break-all">{selectedItem.documento}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(selectedItem.ordens || []).map((op: any) => (
                        <span key={op} className="text-[9px] bg-emerald-50 px-2 py-0.5 rounded text-emerald-700 font-black border border-emerald-100">{op}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Equipe Responsável</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-xs">👤</div>
                      <div>
                        <p className="text-[8px] font-black text-gray-400 uppercase">Separador</p>
                        <p className="text-[10px] font-black text-gray-900 uppercase">{selectedItem.separador || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-xs">🛡️</div>
                      <div>
                        <p className="text-[8px] font-black text-gray-400 uppercase">Conferente</p>
                        <p className="text-[10px] font-black text-gray-900 uppercase">{selectedItem.conferente || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#003D29] p-6 rounded-3xl shadow-lg shadow-emerald-950/20 space-y-2 text-white">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Auditoria</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black uppercase italic">Finalizado</p>
                      <span className="text-emerald-400">✅</span>
                    </div>
                    <p className="text-[10px] font-medium text-gray-400 font-mono italic opacity-60">
                      {new Date(selectedItem.data_finalizacao).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left bg-white">
                  <thead className="bg-[#FFFFFF] border-b border-gray-50">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-300 uppercase tracking-widest">Código</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-300 uppercase tracking-widest">Descrição</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">Qtd</th>
                      <th className="px-8 py-5 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">OK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItem.itens
                      .filter((item: any) => (item.quantidade || 0) > 0)
                      .map((item: any, idx: number) => {
                        const isOk = (item.composicao || []).every((c: any) => c.ok_conf && c.ok2_conf);
                        return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-8 py-6 font-black text-emerald-600 text-[11px] font-mono tracking-tighter w-1/4">{item.codigo}</td>
                            <td className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-tight">{item.descricao}</td>
                            <td className="px-8 py-6 text-center text-sm font-black text-gray-900">{item.quantidade}</td>
                            <td className="px-8 py-6 text-center">
                              {isOk ? (
                                <div className="flex justify-center">
                                  <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-[10px] shadow-sm">✅</div>
                                </div>
                              ) : (
                                <div className="flex justify-center">
                                  <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center text-[10px] shadow-sm">⚠️</div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-10 bg-white border-t border-gray-100 flex justify-end gap-4 shrink-0">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-10 py-4 bg-white border-2 border-gray-100 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
              >
                Sair
              </button>
              <button className="px-10 py-4 bg-[#006B47] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 flex items-center gap-3 hover:bg-[#005538] transition-all active:scale-95">
                <span>📥</span> Exportar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Historico;
