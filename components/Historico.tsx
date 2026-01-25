
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


interface FinishedOP {
  id: string;
  op_range: string;
  armazem: string;
  documento: string;
  ordens: string;
  separador: string;
  conferente: string;
  data_finalizacao: string;
  total_itens: number;
  itens: any[];
}

const Historico: React.FC<{ user: User }> = ({ user }) => {
  const [history, setHistory] = useState<FinishedOP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FinishedOP | null>(null);
  const [searchText, setSearchText] = useState('');

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('historico').select('*').order('id', { ascending: false });
    if (error) console.error(error);
    else if (data) {
      setHistory(data.sort((a: any, b: any) => new Date(b.data_finalizacao).getTime() - new Date(a.data_finalizacao).getTime()));
    }
    setIsLoading(false);
  };


  useEffect(() => {
    fetchHistory();
    const channel = supabase.channel('hist-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistory).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (isLoading && history.length === 0) {
    return <Loading message="Sincronizando Auditoria..." />;
  }


  return (
    <div className="space-y-12 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Histórico</h1>
        <div className="text-[10px] font-bold text-gray-400 uppercase">
          Data do Sistema: <span className="text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-4xl font-black text-[#111827] uppercase tracking-tight">Auditoria Logística</h2>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <p className="text-xs font-bold text-gray-300 uppercase tracking-[0.2em]">Registros Consolidados e Finalizados</p>
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Buscar por OP, Documento, Responsável ou Armazém..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold uppercase tracking-widest outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-200 transition-all shadow-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {history
          .filter(item => {
            const search = searchText.toLowerCase();
            return (
              item.documento?.toLowerCase().includes(search) ||
              item.op_range?.toLowerCase().includes(search) ||
              item.armazem?.toLowerCase().includes(search) ||
              item.separador?.toLowerCase().includes(search) ||
              item.conferente?.toLowerCase().includes(search) ||
              String(item.ordens)?.toLowerCase().includes(search)
            );
          })
          .map((item) => (
            <div key={item.id} className="bg-white rounded-[3rem] border border-gray-50 p-10 space-y-8 flex flex-col justify-between hover:shadow-2xl hover:translate-y-[-8px] transition-all duration-500 group relative overflow-hidden h-[30rem]">
              <div className="space-y-8 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-3xl shadow-sm group-hover:bg-emerald-50 transition-colors">📋</div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">FINALIZADO</p>
                    <p className="text-[11px] font-mono font-black text-gray-300 uppercase">{item.documento}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-lg font-black text-[#111827] uppercase leading-tight tracking-tight">OP {item.op_range}</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Armazém</p>
                      <p className="text-xs font-black text-gray-800 uppercase">{item.armazem}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Total Itens</p>
                      <p className="text-xs font-black text-emerald-600 uppercase">{item.total_itens} UN</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex justify-between items-end border-t border-gray-50 pt-8">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Data Fechamento</p>
                  <p className="text-[10px] font-black text-gray-400 font-mono italic">{new Date(item.data_finalizacao).toLocaleDateString('pt-BR')}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(item)}
                  className="w-14 h-14 bg-[#111827] text-white rounded-[1.5rem] flex items-center justify-center text-2xl font-black shadow-xl shadow-gray-200 hover:rotate-90 transition-all active:scale-95"
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
            {/* Header Mockup Style */}
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
              {/* Info Cards Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Armazém e Doc</p>
                  <div className="space-y-1">
                    <p className="text-lg font-black text-gray-900 uppercase">{selectedItem.armazem}</p>
                    <p className="text-xs font-bold text-emerald-600 font-mono italic">{selectedItem.documento}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Equipe Responsável</p>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-gray-900 uppercase">SEP: <span className="text-gray-500">{selectedItem.separador || 'N/A'}</span></p>
                    <p className="text-xs font-black text-gray-900 uppercase">CONF: <span className="text-gray-500">{selectedItem.conferente || 'N/A'}</span></p>
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

              {/* Table Section */}
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
                    {selectedItem.itens.map((item: any, idx: number) => {
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

            {/* Footer Mockup Style */}
            <div className="p-10 bg-white border-t border-gray-100 flex justify-end gap-4 shrink-0">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-10 py-4 bg-white border-2 border-gray-100 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
              >
                Sair
              </button>
              <button
                className="px-10 py-4 bg-[#006B47] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 flex items-center gap-3 hover:bg-[#005538] transition-all active:scale-95"
              >
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
