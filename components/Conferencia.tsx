import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

interface ConferenceItem {
  id: string;
  codigo: string;
  descricao: string;
  qtdSol: number;
  qtdSep: number;
  statusConferencia?: 'ok' | 'falta' | 'pendente';
  opOrigem: string;
}

interface ConferenceMock {
  id: string;
  armazem: string;
  documento: string;
  totalItens: number;
  data: string;
  status: string;
  opsConferidas: string;
  itensOk: string;
  usuarioAtual?: string | null;
  itens: ConferenceItem[];
}


const Conferencia: React.FC<{ user: User }> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [conferences, setConferences] = useState<ConferenceMock[]>([]);
  const [selectedConf, setSelectedConf] = useState<ConferenceMock | null>(null);
  const [showTransferList, setShowTransferList] = useState(false);
  const [currentResponsavel, setCurrentResponsavel] = useState<string>('');

  useEffect(() => {
    const savedUser = localStorage.getItem('nano_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentResponsavel(user.nome);
    }

    const fetchConferences = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('conferencia')
        .select('*')
        .order('data_criacao', { ascending: false });

      if (error) {
        console.error('Erro ao buscar conferências:', error);
      } else if (data) {
        const formattedConfs: ConferenceMock[] = data.map((item: any) => ({
          id: item.id,
          armazem: item.armazem,
          documento: item.documento,
          totalItens: item.itens?.length || 0,
          data: item.data_criacao,
          status: item.status,
          opsConferidas: item.ops_conferidas || '0/0',
          itensOk: item.itens_ok || '0/0',
          usuarioAtual: item.responsavel_conferencia,
          itens: item.itens || [],
        }));
        setConferences(formattedConfs);
      }
      setIsSyncing(false);
    };

    fetchConferences();

    const channel = supabase
      .channel('schema-db-changes-conf')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conferencia' },
        (payload) => {
          fetchConferences();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStart = async (conf: ConferenceMock) => {
    if (conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel) {
      alert(`Card Bloqueado: O usuário "${conf.usuarioAtual}" já iniciou esta conferência.`);
      return;
    }

    const { error } = await supabase
      .from('conferencia')
      .update({ responsavel_conferencia: currentResponsavel })
      .eq('id', conf.id);

    if (error) {
      alert('Erro ao iniciar conferência: ' + error.message);
      return;
    }

    setSelectedConf({ ...conf, usuarioAtual: currentResponsavel });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedConf) {
      await supabase
        .from('conferencia')
        .update({ responsavel_conferencia: null })
        .eq('id', selectedConf.id);
    }
    setViewMode('list');
    setSelectedConf(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.role !== 'admin') {
      alert('Acesso Negado: Somente administradores podem excluir registros.');
      return;
    }
    if (confirm('Deseja realmente excluir esta conferência?')) {
      const { error } = await supabase
        .from('conferencia')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        setConferences(prev => prev.filter(c => c.id !== id));
      }
    }
  };

  const getStatusBorder = (status: string) => {
    if (status === 'Aguardando') return 'border-orange-500 ring-4 ring-orange-50';
    if (status === 'Em conferencia') return 'border-blue-500 ring-4 ring-blue-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  if (isSyncing && conferences.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse tracking-[0.15em]">Sincronizando Conferência...</p>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedConf) {
    return (
      <div className="space-y-6 animate-fadeIn pb-24 relative">
        {/* Modal Lista de Transferência */}
        {showTransferList && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl animate-scaleIn overflow-hidden border border-gray-100">
              <div className="bg-[#006B47] p-6 flex justify-between items-center text-white">
                <h3 className="text-lg font-black uppercase flex items-center gap-2">📋 Lista de Transferência</h3>
                <button onClick={() => setShowTransferList(false)} className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all text-sm">✕</button>
              </div>
              <div className="p-8 space-y-3 bg-gray-50/50">
                <p className="text-sm font-black text-gray-700 uppercase">Documento: <span className="text-emerald-700 font-black">{selectedConf.documento}</span></p>
                <p className="text-sm font-black text-gray-700 uppercase">Status: <span className="text-emerald-700 font-black">{selectedConf.status}</span></p>
              </div>
              <div className="p-8">
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-5">OK</th>
                        <th className="px-6 py-5">CÓDIGO</th>
                        <th className="px-6 py-5">DESCRIÇÃO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedConf.itens.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-6"><input type="checkbox" className="w-7 h-7 rounded-lg border-2 border-gray-200" /></td>
                          <td className="px-6 py-6 font-mono text-xs font-black text-gray-700 uppercase">{item.codigo}</td>
                          <td className="px-6 py-6 text-[11px] font-bold text-gray-500 uppercase">{item.descricao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-gray-50 p-8 flex justify-end gap-4 border-t border-gray-100">
                <button onClick={() => setShowTransferList(false)} className="px-10 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[11px] font-black uppercase tracking-widest">Fechar</button>
                <button className="px-10 py-4 bg-emerald-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-emerald-50">✅ Finalizar</button>
              </div>
            </div>
          </div>
        )}

        <button onClick={handleBack} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50">← Voltar</button>

        <div className="bg-white rounded-[3.5rem] border border-gray-100 shadow-sm p-32 text-center font-black text-gray-200 uppercase tracking-widest text-sm italic">
          Módulo de Conferência Ativo
        </div>

        <div className="flex flex-wrap justify-end gap-6 pt-12 pb-8">
          <button onClick={handleBack} className="px-12 py-6 bg-[#F2A516] text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl hover:scale-105 transition-all">
            <span className="bg-blue-600 p-2.5 rounded-xl flex items-center justify-center text-xl">⏸️</span> Salvar com Pendências
          </button>
          <button onClick={() => setShowTransferList(true)} className="px-12 py-6 bg-blue-500 text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl hover:scale-105 transition-all">
            <span className="text-2xl">📋</span> Lista de Transferência
          </button>
          <button onClick={handleBack} className="px-12 py-6 bg-emerald-600 text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl hover:scale-105 transition-all">
            <span className="text-2xl">✔️</span> Finalizar Conferência
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
      {conferences.map(conf => (
        <div key={conf.id} className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all flex flex-col justify-between h-[32rem] ${getStatusBorder(conf.status)} hover:shadow-2xl`}>
          <div className="space-y-6">
            <span className={`text-[10px] font-black px-4 py-1.5 rounded-full border uppercase tracking-widest ${conf.status === 'Aguardando' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
              {conf.status}
            </span>

            {user.role === 'admin' && (
              <button
                onClick={(e) => handleDelete(conf.id, e)}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all z-20"
                title="Excluir Registro"
              >
                <span className="text-sm font-black">✕</span>
              </button>
            )}

            <div className="space-y-4">
              <h4 className="text-[24px] font-black text-gray-900 uppercase leading-none tracking-tight">OP {conf.id.toString().slice(0, 6)}</h4>
              <div className="space-y-2 text-[10px] font-bold text-gray-500 uppercase">
                <p className="flex items-center gap-2">📍 Armazém: <span className="text-gray-900 font-black">{conf.armazem}</span></p>
                <p className="flex items-center gap-2">📄 Doc: <span className="text-blue-600 font-mono font-black">{conf.documento}</span></p>
                <p className="flex items-center gap-2">👤 Responsável: <span className={`font-black ${conf.usuarioAtual ? 'text-emerald-700' : 'text-gray-400 italic'}`}>{conf.usuarioAtual || 'Disponível'}</span></p>

                <div className="pt-2 mt-2 border-t border-gray-50 space-y-1">
                  <p className="flex items-center justify-between text-gray-400"><span>✅ OPs:</span> <span className="text-gray-800 font-black">{conf.opsConferidas} conferidas</span></p>
                  <p className="flex items-center justify-between text-gray-400"><span>🔍 Itens:</span> <span className="text-gray-800 font-black">{conf.itensOk} OK</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            <p className="text-[8px] font-mono font-black text-gray-300 uppercase tracking-widest">{new Date(conf.data).toLocaleString('pt-BR')}</p>
            <button
              onClick={() => handleStart(conf)}
              className={`w-full py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 ${conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-emerald-600 shadow-gray-200'}`}
            >
              {conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel ? `EM USO: ${conf.usuarioAtual}` : 'Abrir Conferência'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Conferencia;
