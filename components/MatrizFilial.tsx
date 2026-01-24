import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

interface ShipmentHistory {
  id: string;
  op: string;
  produto: string;
  qtd: number;
  data: string;
  fluxo: { status: string; icon: string; data: string }[];
}

const mockHistory: ShipmentHistory[] = [
  {
    id: '1',
    op: '00661601001',
    produto: 'PA090200001263',
    qtd: 1,
    data: '21/01/2026',
    fluxo: [
      { status: 'Em Separação', icon: '📦', data: '21/01/2026' },
      { status: 'Em Conferência', icon: '🔍', data: '21/01/2026' },
      { status: 'Em Qualidade', icon: '🔬', data: '21/01/2026' },
      { status: 'Endereçar', icon: '📍', data: '21/01/2026' },
      { status: 'Em Trânsito', icon: '🚚', data: '21/01/2026' },
      { status: 'Recebido', icon: '✅', data: '22/01/2026' }
    ]
  }
];

const MatrizFilial: React.FC<{ user: User }> = ({ user }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [history, setHistory] = useState<ShipmentHistory[]>([]);

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
          fluxo: item.fluxo || []
        })));
      }
      setIsSyncing(false);
    };

    if (showHistory) {
      fetchHistory();
    }
  }, [showHistory]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.role !== 'admin') {
      alert('Acesso Negado: Somente administradores podem excluir registros.');
      return;
    }
    if (confirm('Deseja realmente excluir esta movimentação?')) {
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
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest animate-pulse">Sincronizando Histórico...</p>
      </div>
    );
  }

  if (showHistory) {
    return (
      <div className="space-y-6 animate-fadeIn pb-16">
        <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
          <div className="flex items-center gap-5">
            <span className="text-3xl bg-emerald-50 p-3 rounded-2xl">📚</span>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Histórico de Movimentações TEA</h2>
          </div>
          <button onClick={() => setShowHistory(false)} className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">✕</button>
        </div>

        <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/30 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                <th className="px-10 py-8">OP</th>
                <th className="px-8 py-8">PRODUTO</th>
                <th className="px-6 py-8 text-center">QTD</th>
                <th className="px-6 py-8 text-center">DATA</th>
                <th className="px-10 py-8">FLUXO DE MOVIMENTAÇÃO</th>
                <th className="px-10 py-8 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-10 py-8 font-black text-gray-800 uppercase tracking-tighter">{h.op}</td>
                  <td className="px-8 py-8 font-mono text-xs text-gray-400 uppercase">{h.produto}</td>
                  <td className="px-6 py-8 text-center font-black text-gray-900 text-sm">{h.qtd}</td>
                  <td className="px-6 py-8 text-center font-bold text-gray-400 text-xs">{h.data}</td>
                  <td className="px-10 py-8">
                    <div className="flex flex-wrap items-center gap-y-2 text-[9px] font-black text-gray-500 uppercase">
                      {h.fluxo.map((f, idx) => (
                        <React.Fragment key={idx}>
                          <div className="flex flex-col items-center gap-1 bg-white border border-gray-100 p-2 rounded-xl shadow-sm min-w-[100px]">
                            <span className="text-gray-900 whitespace-nowrap">{f.icon} {f.status}</span>
                            <span className="text-[8px] opacity-40">({f.data})</span>
                          </div>
                          {idx < h.fluxo.length - 1 && <span className="mx-2 text-gray-200 text-sm">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    {user.role === 'admin' && (
                      <button
                        onClick={(e) => handleDelete(h.id, e)}
                        className="inline-flex items-center justify-center w-8 h-8 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-red-100 shadow-sm"
                        title="Excluir Registro"
                      >
                        <span className="text-[14px] font-black italic">✕</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-gray-50/50 p-10 flex justify-end border-t border-gray-100">
            <button onClick={() => setShowHistory(false)} className="px-12 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Fechar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-32 bg-white rounded-[4rem] border border-gray-100 shadow-sm text-center space-y-8 flex flex-col items-center justify-center border-dashed">
      <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center text-4xl mb-4">🚚</div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Gestão Logística TEA</h2>
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Painel de controle e auditoria de transferências</p>
      </div>
      <button onClick={() => setShowHistory(true)} className="px-12 py-5 bg-gray-900 text-white rounded-[1.75rem] text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-2xl shadow-gray-200 hover:scale-105 active:scale-95">
        Abrir Histórico Completo
      </button>
    </div>
  );
};

export default MatrizFilial;
