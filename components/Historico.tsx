
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


interface FinishedOP {
  id: string;
  opRange: string;
  armazem: string;
  documento: string;
  ordens: string;
  separador: string;
  conferente: string;
  dataFinalizacao: string;
  totalItens: number;
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
      const sortedHistory = data
        .map((item: any) => ({
          ...item,
          opRange: item.opRange || item.documento, // Fallback
          dataFinalizacao: item.data_finalizacao || item.data || new Date().toISOString(),
          totalItens: item.totalItens || (Array.isArray(item.itens) ? item.itens.length : 0)
        }))
        .sort((a: any, b: any) => a.documento.localeCompare(b.documento));
      setHistory(sortedHistory);
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
              item.opRange?.toLowerCase().includes(search) ||
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
                  <h4 className="text-lg font-black text-[#111827] uppercase leading-tight tracking-tight">OP {item.opRange}</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Armazém</p>
                      <p className="text-xs font-black text-gray-800 uppercase">{item.armazem}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Total Itens</p>
                      <p className="text-xs font-black text-emerald-600 uppercase">{item.totalItens} UN</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex justify-between items-end border-t border-gray-50 pt-8">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Data Fechamento</p>
                  <p className="text-[10px] font-black text-gray-400 font-mono italic">{new Date(item.dataFinalizacao).toLocaleDateString('pt-BR')}</p>
                </div>
                <button className="w-14 h-14 bg-[#111827] text-white rounded-[1.5rem] flex items-center justify-center text-2xl font-black shadow-xl shadow-gray-200 hover:rotate-90 transition-all active:scale-95">
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
    </div>
  );
};

export default Historico;
