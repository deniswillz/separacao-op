
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

interface ConfItem {
  id: string;
  documento: string;
  nome: string;
  armazem: string;
  ordens: string[];
  itens: any[];
  status: string;
  data_conferencia: string;
  responsavel_conferencia: string | null;
}


const Conferencia: React.FC<{ user: User }> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [items, setItems] = useState<ConfItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConfItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('conferencia').select('*').order('data_conferencia', { ascending: false });
    if (error) console.error(error);
    else if (data) setItems(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchItems();
    const channel = supabase.channel('conf-live').on('postgres_changes', { event: '*', schema: 'public', table: 'conferencia' }, fetchItems).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleOpen = async (item: ConfItem) => {
    if (item.responsavel_conferencia && item.responsavel_conferencia !== user.nome) {
      alert(`⚠️ Bloqueio: Em uso por "${item.responsavel_conferencia}"`);
      return;
    }
    await supabase.from('conferencia').update({ responsavel_conferencia: user.nome, status: 'Em Conferência' }).eq('id', item.id);
    setSelectedItem({ ...item, responsavel_conferencia: user.nome, status: 'Em Conferência' });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedItem) await supabase.from('conferencia').update({ responsavel_conferencia: null }).eq('id', selectedItem.id);
    setViewMode('list'); setSelectedItem(null);
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-[#006B47] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-[#006B47] uppercase tracking-widest animate-pulse tracking-[0.2em]">Sincronizando Conferência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Conferência</h1>
        <div className="text-[10px] font-bold text-gray-400 uppercase">
          Data do Sistema: <span className="text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      {viewMode === 'detail' && selectedItem ? (
        <div className="space-y-6 animate-fadeIn">
          <button onClick={handleBack} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">← Voltar</button>
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-10 text-center space-y-4">
            <h2 className="text-2xl font-black uppercase">Módulo de Conferência em Desenvolvimento</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Aguardando implementação dos detalhes de conferência conforme mockup original.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {items.map((item) => {
            const isAguardando = item.status === 'Aguardando' || !item.responsavel_conferencia;
            const isEmUso = item.responsavel_conferencia && item.responsavel_conferencia !== user.nome;

            return (
              <div key={item.id} className="bg-white rounded-[2.5rem] border border-gray-100 p-10 space-y-8 flex flex-col justify-between hover:shadow-2xl hover:translate-y-[-8px] transition-all duration-500 group relative overflow-hidden h-[34rem]">
                <div className="space-y-8 relative z-10">
                  <div className="flex justify-start">
                    <span className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${isAguardando ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                      {isAguardando ? 'AGUARDANDO' : 'EM CONFERENCIA'}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-3xl font-black text-[#111827] tracking-tighter uppercase leading-none">OP {item.nome || item.documento}</h3>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base">📍</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Armazém: <span className="text-gray-900">{item.armazem}</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base">📋</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">DOC: <span className="text-blue-600 font-mono italic">{item.itens?.[0]?.doc_transferencia || 'S/N'}</span></p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-base">👤</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Responsável: <span className={item.responsavel_conferencia ? 'text-emerald-600' : 'text-gray-300 italic'}>{item.responsavel_conferencia || 'DISPONÍVEL'}</span></p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-base">✅</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">OPS: <span className="text-gray-900">0/{item.ordens?.length || 1} CONFERIDAS</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base">🔍</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ITENS: <span className="text-gray-900">0/{item.itens?.length || 0} OK</span></p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-4 flex flex-col justify-end">
                  <p className="text-[8px] font-black text-gray-200 uppercase tracking-widest mb-4">{item.data_conferencia}</p>
                  {isEmUso ? (
                    <div className="w-full py-5 bg-gray-50 text-gray-400 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-center">
                      Em uso: {item.responsavel_conferencia}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpen(item)}
                      className="w-full py-5 bg-[#111827] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-gray-200 active:scale-95 transition-all"
                    >
                      Abrir Conferência
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Conferencia;
