
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

interface ConferenceItem {
  id: string;
  codigo: string;
  descricao: string;
  qtdSol: number;
  qtdSep: number; // Qtd definida na separação (lupa)
  qtdConf: number; // Qtd conferida agora
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
  transferencia?: string;
  responsavel_separacao?: string;
}

const Conferencia: React.FC<{ user: User }> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [conferences, setConferences] = useState<ConferenceMock[]>([]);
  const [selectedConf, setSelectedConf] = useState<ConferenceMock | null>(null);
  const [showTransferList, setShowTransferList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConferences = async () => {
    setIsSyncing(true);
    const { data, error } = await supabase
      .from('conferencia')
      .select('*')
      .order('data_conferencia', { ascending: false });

    if (error) {
      console.error('Erro ao buscar conferências:', error);
    } else if (data) {
      const formattedConfs: ConferenceMock[] = data.map((item: any) => {
        const itens = item.itens || [];
        const ops = new Set(itens.map((i: any) => i.opOrigem)).size;
        const opsOk = new Set(itens.filter((i: any) => i.statusConferencia === 'ok').map((i: any) => i.opOrigem)).size;
        const itensOk = itens.filter((i: any) => i.statusConferencia === 'ok').length;

        return {
          id: item.id,
          armazem: item.armazem,
          documento: item.documento,
          totalItens: itens.length,
          data: item.data_conferencia,
          status: item.status || 'Aguardando',
          opsConferidas: `${opsOk}/${ops}`,
          itensOk: `${itensOk}/${itens.length}`,
          usuarioAtual: item.responsavel_conferencia,
          itens: itens,
          transferencia: item.transferencia || '',
          responsavel_separacao: item.responsavel_separacao || 'Não identificado'
        };
      });
      setConferences(formattedConfs);
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    fetchConferences();
    const channel = supabase.channel('schema-db-changes-conf')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferencia' }, fetchConferences)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleStart = async (conf: ConferenceMock) => {
    if (conf.usuarioAtual && conf.usuarioAtual !== user.nome) {
      alert(`⚠️ BLOQUEIO: Em uso por "${conf.usuarioAtual}".`);
      return;
    }

    const { error } = await supabase
      .from('conferencia')
      .update({ responsavel_conferencia: user.nome, status: 'Em Conferência' })
      .eq('id', conf.id);

    if (error) {
      alert('Erro ao iniciar: ' + error.message);
      return;
    }

    setSelectedConf({ ...conf, usuarioAtual: user.nome, status: 'Em Conferência' });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedConf) {
      await supabase.from('conferencia').update({ responsavel_conferencia: null }).eq('id', selectedConf.id);
    }
    setViewMode('list');
    setSelectedConf(null);
  };

  const updateQtdConf = (itemIdx: number, delta: number | 'total') => {
    if (!selectedConf) return;
    const newItens = [...selectedConf.itens];
    const item = { ...newItens[itemIdx] };

    if (delta === 'total') {
      item.qtdConf = item.qtdSep;
    } else {
      item.qtdConf = Math.max(0, (item.qtdConf || 0) + delta);
    }

    item.statusConferencia = item.qtdConf === item.qtdSep ? 'ok' : item.qtdConf > 0 ? 'pendente' : 'pendente';
    if (item.qtdConf > item.qtdSep) {
      // Opcional: Alerta de excesso
    }

    newItens[itemIdx] = item;
    setSelectedConf({ ...selectedConf, itens: newItens });
  };

  const handleFinalize = async () => {
    if (!selectedConf) return;
    const hasDivergence = selectedConf.itens.some(i => i.qtdConf !== i.qtdSep);
    if (hasDivergence) {
      if (!confirm('Existem divergências entre a separação e a conferência. Deseja finalizar assim mesmo?')) return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('conferencia')
      .update({
        status: 'Historico',
        responsavel_conferencia: null,
        itens: selectedConf.itens,
        data_finalizado: new Date().toISOString()
      } as any)
      .eq('id', selectedConf.id);

    if (error) {
      alert('Erro ao finalizar: ' + error.message);
    } else {
      // TEA Sync (simplificado)
      try {
        const uniqueOps = Array.from(new Set(selectedConf.itens.map(i => i.opOrigem)));
        for (const opCode of uniqueOps) {
          const { data: teaRecord } = await supabase.from('historico').select('*').eq('documento', opCode).maybeSingle();
          if (teaRecord) {
            const newFluxo = [...(teaRecord.itens || []), { status: 'Qualidade', icon: '🔬', data: new Date().toLocaleDateString('pt-BR') }];
            await supabase.from('historico').update({ itens: newFluxo }).eq('id', teaRecord.id);
          }
        }
      } catch (e) { console.error(e); }

      alert('Conferência finalizada com sucesso!');
      setViewMode('list');
      setSelectedConf(null);
    }
    setIsSaving(false);
  };

  const progress = selectedConf ? Math.round((selectedConf.itens.filter(i => i.qtdConf === i.qtdSep).length / selectedConf.itens.length) * 100) : 0;
  const itemsOkCount = selectedConf ? selectedConf.itens.filter(i => i.qtdConf === i.qtdSep).length : 0;
  const divergencesCount = selectedConf ? selectedConf.itens.filter(i => i.qtdConf !== i.qtdSep && i.qtdConf > 0).length : 0;

  if (isSyncing && conferences.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-[#006B47] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-[#006B47] uppercase tracking-widest animate-pulse">Sincronizando Conferência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-20 -m-8 p-8 bg-[#F8FAFC] min-h-screen">
      {/* HEADER GERAL */}
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-[#006B47] rounded-full"></div>
          <h1 className="text-xl font-black text-gray-800 uppercase tracking-tight">Conferência</h1>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black text-gray-400 uppercase">Data do Sistema</p>
          <p className="text-xs font-black text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {viewMode === 'detail' && selectedConf ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* MODAL LISTA DE TRANSFERENCIA */}
          {showTransferList && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="bg-[#007F5F] px-8 py-5 flex justify-between items-center text-white shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📋</span>
                    <h3 className="text-base font-extrabold uppercase tracking-tight">Lista de Transferência</h3>
                  </div>
                  <button onClick={() => setShowTransferList(false)} className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">✕</button>
                </div>
                <div className="p-10 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                  <div className="space-y-1 text-xs font-bold text-gray-600">
                    <p>Documento de Transferência: <span className="text-gray-400">{selectedConf.documento}</span></p>
                    <p>Responsável Separação: <span className="text-gray-400">{selectedConf.responsavel_separacao}</span></p>
                    <p>Verificados: <span className="text-gray-400">{selectedConf.itens.filter(i => i.statusConferencia === 'ok').length}/{selectedConf.itens.length} ⌛</span></p>
                  </div>
                  <div className="border rounded-[2rem] overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase">
                        <tr>
                          <th className="px-6 py-4">OK</th>
                          <th className="px-6 py-4">CÓDIGO</th>
                          <th className="px-8 py-4">DESCRIÇÃO</th>
                          <th className="px-6 py-4 text-center text-[9px]">QTD SOLIC.</th>
                          <th className="px-6 py-4 text-center text-[9px]">QTD SEPAR.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedConf.itens.map((item, idx) => (
                          <tr key={idx} className="text-gray-600">
                            <td className="px-6 py-5"><input type="checkbox" checked={item.statusConferencia === 'ok'} readOnly className="w-5 h-5 rounded border-gray-300 text-[#007F5F]" /></td>
                            <td className="px-6 py-5">
                              <p className="text-[11px] font-black">{item.codigo}</p>
                              <p className="text-[9px] font-bold text-gray-300">OP: {item.opOrigem}</p>
                            </td>
                            <td className="px-8 py-5 text-[11px] font-bold uppercase">{item.descricao}</td>
                            <td className="px-6 py-5 text-center font-black">{item.qtdSol}</td>
                            <td className="px-6 py-5 text-center font-black text-[#007F5F]">{item.qtdSep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-center gap-3">
                    <span className="text-amber-500">⚠️</span>
                    <p className="text-[10px] font-bold text-amber-800 leading-tight">
                      A <strong>Qtd Separada</strong> é vinculada ao valor definido na Lupa durante a separação. Itens em vermelho indicam quantidade menor que a solicitada.
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 p-8 flex justify-end gap-4 shrink-0 border-t items-center">
                  <button onClick={() => setShowTransferList(false)} className="px-10 py-3 bg-white border rounded-xl text-[10px] font-black uppercase text-gray-500 shadow-sm hover:bg-gray-100 transition-all">Fechar</button>
                  <button className="px-10 py-3 bg-[#00C48C] text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-600 transition-all">
                    <span className="text-xs">✔️</span> Marcar Todos
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="lg:col-span-3 space-y-6">
            <div className="flex justify-between items-center">
              <button onClick={handleBack} className="px-6 py-3 bg-white border rounded-2xl text-[10px] font-black text-gray-400 uppercase shadow-sm hover:bg-gray-50 transition-all">← Voltar</button>
              <div className="flex gap-10">
                <div className="text-right">
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Documento</p>
                  <p className="text-xs font-black text-gray-700">{selectedConf.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Responsável</p>
                  <p className="text-xs font-black text-[#007F5F]">{user.nome}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#F9FAFB] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                  <tr>
                    <th className="px-8 py-6">PRODUTO</th>
                    <th className="px-6 py-6 text-center">SEPARADO</th>
                    <th className="px-6 py-6 text-center">CONFERIDO</th>
                    <th className="px-6 py-6 text-center">AÇÃO RÁPIDA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedConf.itens.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-black text-gray-800">{item.codigo}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">{item.descricao}</p>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span className="px-4 py-2 bg-gray-100 rounded-xl font-black text-xs text-gray-400">{item.qtdSep}</span>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span className="text-lg font-black text-gray-800">{item.qtdConf || 0}</span>
                      </td>
                      <td className="px-6 py-6 font-black">
                        <div className="flex justify-center items-center gap-2">
                          <button onClick={() => updateQtdConf(idx, -1)} className="w-8 h-8 rounded-lg bg-gray-50 border text-gray-400 hover:bg-gray-100 transition-all">-</button>
                          <button onClick={() => updateQtdConf(idx, 1)} className="w-8 h-8 rounded-lg bg-[#E6F4ED] border-[#007F5F]/10 text-[#007F5F] hover:bg-[#D5EBE0] transition-all font-bold">+</button>
                          <button onClick={() => updateQtdConf(idx, 'total')} className="px-4 h-8 bg-[#111827] text-white rounded-lg text-[8px] font-black uppercase hover:bg-black transition-all">TOTAL</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4">
              <button className="flex-1 py-5 bg-[#F59E0B] text-white rounded-[1.75rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-amber-50 hover:bg-amber-600 transition-all">
                <span className="text-base">⏸️</span> Salvar com Pendências
              </button>
              <button onClick={() => setShowTransferList(true)} className="flex-1 py-5 bg-[#3B82F6] text-white rounded-[1.75rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-blue-50 hover:bg-blue-600 transition-all">
                <span className="text-base">📋</span> Lista de Transferência
              </button>
              <button onClick={handleFinalize} className="flex-1 py-5 bg-[#6EE7B7] text-[#065F46] rounded-[1.75rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border shadow-sm hover:bg-emerald-300 transition-all">
                <span className="text-base">✔️</span> Finalizar Conferência
              </button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-10 rounded-[2.5rem] border shadow-sm sticky top-8 space-y-10">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] border-b pb-4">Resumo da Conferência</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso Geral</p>
                  <p className="text-2xl font-black text-[#007F5F]">{progress}%</p>
                </div>
                <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden border">
                  <div className="h-full bg-[#007F5F] transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-[#E6F4ED] p-6 rounded-[1.5rem] border border-[#007F5F]/10 space-y-1">
                  <p className="text-[9px] font-black text-[#007F5F] uppercase tracking-widest">Itens OK</p>
                  <p className="text-2xl font-black text-[#007F5F]">{itemsOkCount}</p>
                </div>
                <div className="bg-[#FFFBEB] p-6 rounded-[1.5rem] border border-amber-200/50 space-y-1">
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Divergências</p>
                  <p className="text-2xl font-black text-amber-600">{divergencesCount}</p>
                </div>
              </div>

              <button onClick={handleFinalize} className="w-full py-5 bg-[#00966D] text-white rounded-[1.75rem] font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-50 hover:bg-[#007F5F] transition-all active:scale-95 duration-200">
                Finalizar e Salvar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {conferences.map(conf => {
            const isLocked = conf.usuarioAtual && conf.usuarioAtual !== user.nome;
            const badgeColor = conf.status === 'Aguardando' ? 'bg-[#FFF3E0] text-[#E65100]' : 'bg-[#E3F2FD] text-[#0D47A1]';

            return (
              <div key={conf.id} className={`bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-[36rem] transition-all hover:shadow-2xl hover:translate-y-[-8px] relative group overflow-hidden ${isLocked ? 'opacity-60 grayscale' : ''}`}>
                <div className="space-y-8 relative z-10">
                  <div className="inline-flex items-center px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-50 border" style={{ backgroundColor: conf.status === 'Aguardando' ? '#FFFBEB' : '#EFF6FF', color: conf.status === 'Aguardando' ? '#D97706' : '#2563EB' }}>
                    {conf.status}
                  </div>

                  <h4 className="text-2xl font-black text-gray-900 uppercase leading-snug tracking-tighter">OP {conf.id.toString().slice(0, 11)}</h4>

                  <div className="space-y-4 pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-red-500 text-sm">📍</span>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Armazém: <span className="text-gray-900">{conf.armazem}</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">📄</span>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Doc: <span className="text-[#3B82F6] font-mono">{conf.documento}</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">👤</span>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsável: <span className="text-gray-200 italic">{conf.usuarioAtual || 'Disponível'}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-300 uppercase flex items-center gap-2">
                        <span className="text-green-500">✔️</span> OPS:
                      </p>
                      <p className="text-sm font-black text-gray-800 tracking-tighter">{conf.opsConferidas} <span className="text-[9px] text-gray-400 uppercase">Conferidas</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-300 uppercase flex items-center gap-2">
                        <span className="text-blue-500">🔍</span> Itens:
                      </p>
                      <p className="text-sm font-black text-gray-800 tracking-tighter">{conf.itensOk} <span className="text-[9px] text-gray-400 uppercase">OK</span></p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-4">
                  <p className="text-[10px] font-bold text-gray-200 italic opacity-50">{conf.data}</p>
                  <button
                    onClick={() => handleStart(conf)}
                    disabled={isLocked}
                    className={`w-full py-5 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-[#111827] text-white hover:bg-black shadow-gray-200'}`}
                  >
                    {isLocked ? `Em uso: ${conf.usuarioAtual}` : 'Abrir Conferência'}
                  </button>
                </div>

                <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50/50 rounded-bl-[100%] z-0 group-hover:bg-[#E6F4ED] transition-colors duration-500"></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Conferencia;
