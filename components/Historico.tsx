import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

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
  itens: { codigo: string; descricao: string; qtd: number; ok: boolean; obs: string }[];
}

const mockHistory: FinishedOP[] = [
  {
    id: '1',
    opRange: '00657601001 - 00657901001',
    armazem: 'CHICOTE',
    documento: 'CC00102X2',
    ordens: '00657601001, 00657701001, 00657801001, 00657901001',
    separador: 'Denis',
    conferente: 'Felipe',
    dataFinalizacao: '2026-01-15T13:59:37.868',
    totalItens: 36,
    itens: [
      { codigo: 'MP0101000000010', descricao: 'TRAVA CONECTOR DELPHI 6 VIAS', qtd: 2, ok: true, obs: '-' },
      { codigo: 'MP0101000000017', descricao: 'TRAVA EM CUNHA DT06 4 VIAS FEMEA', qtd: 11, ok: true, obs: '-' },
      { codigo: 'MP0101000000026', descricao: 'VEDACAO CINZA DO CONECTOR PORTA FUSIVEL', qtd: 6, ok: true, obs: '-' },
    ]
  }
];
const Historico: React.FC<{ user: User }> = ({ user }) => {
  const [isSyncing, setIsSyncing] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FinishedOP | null>(null);
  const [history, setHistory] = useState<FinishedOP[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('historico')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setHistory(data.map((item: any) => ({
          ...item,
          dataFinalizacao: item.data // Mapeando 'data' do DB para 'dataFinalizacao' do estado
        })));
      }
      setIsSyncing(false);
    };

    fetchHistory();

    const channel = supabase.channel('historico-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistory)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.role !== 'admin') {
      alert('Acesso Negado: Somente administradores podem excluir registros.');
      return;
    }
    if (confirm('Deseja realmente excluir este registro do histórico?')) {
      const { error } = await supabase
        .from('historico')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        setHistory(prev => prev.filter(h => h.id !== id));
      }
    }
  };

  if (isSyncing) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse tracking-[0.2em]">Sincronizando Auditoria...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl animate-scaleIn flex flex-col max-h-[95vh] border border-gray-100">
            <div className="bg-[#006B47] px-8 py-5 flex justify-between items-center text-white shrink-0">
              <h3 className="text-base font-extrabold uppercase tracking-tight">Detalhamento Logístico</h3>
              <button onClick={() => setSelectedItem(null)} className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all text-sm">✕</button>
            </div>

            <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Armazém e Doc</p>
                  <p className="text-sm font-black text-gray-900 uppercase">{selectedItem.armazem}</p>
                  <p className="text-[11px] font-black text-emerald-600 font-mono mt-1">{selectedItem.documento}</p>
                </div>
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Equipe Responsável</p>
                  <p className="text-[11px] font-bold text-gray-700 uppercase">Sep: {selectedItem.separador}</p>
                  <p className="text-[11px] font-bold text-gray-700 uppercase">Conf: {selectedItem.conferente}</p>
                </div>
                <div className="bg-emerald-900 text-white p-5 rounded-2xl shadow-lg">
                  <p className="text-[10px] font-black text-emerald-400 uppercase mb-2">Status Auditoria</p>
                  <p className="text-sm font-black uppercase">Finalizado ✅</p>
                  <p className="text-[10px] font-mono mt-1 opacity-60">{selectedItem.dataFinalizacao}</p>
                </div>
              </div>

              <div className="border border-gray-100 rounded-[2rem] overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-5">CÓDIGO</th>
                      <th className="px-6 py-5">DESCRIÇÃO</th>
                      <th className="px-6 py-5 text-center">QTD</th>
                      <th className="px-6 py-5 text-center">OK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItem.itens.map((item, idx) => (
                      <tr key={idx} className="text-[11px] font-bold text-gray-500 hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-6 font-mono text-emerald-700">{item.codigo}</td>
                        <td className="px-6 py-6 uppercase">{item.descricao}</td>
                        <td className="px-6 py-6 text-center font-black text-gray-800">{item.qtd}</td>
                        <td className="px-6 py-6 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-50 text-emerald-600 rounded-lg font-black text-xs border border-emerald-100">✔️</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50/80 p-8 flex justify-end gap-5 shrink-0 border-t border-gray-100">
              <button onClick={() => setSelectedItem(null)} className="px-10 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Sair</button>
              <button className="px-10 py-4 bg-[#006B47] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-[#004D33] transition-all shadow-xl shadow-emerald-50">
                📥 Exportar Relatório
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Auditoria Logística</h1>
        <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest mt-1">Registros consolidados e finalizados</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {history.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-sm hover:border-emerald-500 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between h-[24rem] relative overflow-hidden hover:translate-y-[-5px]"
          >
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-center">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-all">📋</div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Finalizado</p>
                  <p className="text-[12px] font-mono font-black text-gray-300 uppercase tracking-tighter">{item.documento}</p>
                </div>
              </div>

              {user.role === 'admin' && (
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all z-20"
                  title="Excluir Registro"
                >
                  <span className="text-sm font-black">✕</span>
                </button>
              )}

              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight leading-snug line-clamp-3">
                  OP {item.opRange}
                </h4>

                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Armazém</p>
                    <p className="text-[11px] font-black text-gray-700 uppercase">{item.armazem}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Total Itens</p>
                    <p className="text-[11px] font-black text-emerald-700 uppercase">{item.totalItens} Un</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-50 flex justify-between items-center relative z-10">
              <div className="space-y-0.5">
                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Data Fechamento</p>
                <p className="text-[10px] font-black text-gray-600 font-mono tracking-tighter">{new Date(item.dataFinalizacao).toLocaleDateString()}</p>
              </div>
              <button className="w-12 h-12 bg-gray-900 text-white rounded-[1.25rem] flex items-center justify-center font-black transition-all group-hover:bg-emerald-600 shadow-xl shadow-gray-100">
                <span className="text-xl">+</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Historico;
