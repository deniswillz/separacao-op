
import React, { useState, useEffect } from 'react';
import { UrgencyLevel, User } from '../types';
import { BlacklistItem } from '../App';
import { supabase } from '../services/supabaseClient';

interface OPMock {
  id: string;
  opCode: string;
  armazem: string;
  ordens: number;
  totalItens: number;
  data: string;
  progresso: number;
  urgencia: UrgencyLevel;
  status: string;
  usuarioAtual?: string | null;
  observacao?: string;
  separados: number;
  transferidos: number;
  naoSeparados: number;
  rawItens: any[];
}

const Separacao: React.FC<{ blacklist: BlacklistItem[], user: User }> = ({ blacklist, user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [ops, setOps] = useState<OPMock[]>([]);
  const [selectedOP, setSelectedOP] = useState<OPMock | null>(null);

  useEffect(() => {
    const fetchOps = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('separacao')
        .select('*')
        .order('data_criacao', { ascending: false });

      if (error) {
        console.error('Erro ao buscar OPs:', error);
      } else if (data) {
        const formattedOps: OPMock[] = data.map((item: any) => ({
          id: item.id,
          opCode: item.documento,
          armazem: item.armazem,
          ordens: item.ordens?.length || 0,
          totalItens: item.itens?.length || 0,
          data: item.data_criacao,
          progresso: calculateProgress(item.itens),
          urgencia: item.urgencia || 'media', // Default if missing
          status: item.status,
          usuarioAtual: item.usuario_atual,
          observacao: item.observacao,
          separados: item.itens?.filter((i: any) => i.separado).length || 0,
          transferidos: item.itens?.filter((i: any) => i.transferido).length || 0,
          naoSeparados: item.itens?.filter((i: any) => !i.separado).length || 0,
          rawItens: item.itens || [],
        }));
        setOps(formattedOps);
      }
      setIsSyncing(false);
    };

    fetchOps();

    // Realtime subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'separacao' },
        (payload) => {
          fetchOps();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const currentResponsavel = user.nome;

  const calculateProgress = (itens: any[]) => {
    if (!itens || itens.length === 0) return 0;
    const separados = itens.filter(i => i.separado).length;
    return Math.round((separados / itens.length) * 100);
  };

  const handleStart = async (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== currentResponsavel) {
      alert(`Bloqueio de Segurança: O usuário "${op.usuarioAtual}" já está trabalhando nesta OP.`);
      return;
    }

    // Set lock in Supabase
    const { error } = await supabase
      .from('separacao')
      .update({ usuario_atual: currentResponsavel })
      .eq('id', op.id);

    if (error) {
      alert('Erro ao iniciar separação: ' + error.message);
      return;
    }

    setSelectedOP({ ...op, usuarioAtual: currentResponsavel });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedOP) {
      // Clear lock in Supabase
      await supabase
        .from('separacao')
        .update({ usuario_atual: null })
        .eq('id', selectedOP.id);
    }
    setViewMode('list');
    setSelectedOP(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.role !== 'admin') {
      alert('Acesso Negado: Somente administradores podem excluir registros.');
      return;
    }
    if (confirm('Deseja realmente excluir esta OP?')) {
      const { error } = await supabase
        .from('separacao')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        setOps(prev => prev.filter(op => op.id !== id));
      }
    }
  };

  const getStatusBorder = (op: OPMock) => {
    if (op.urgencia === 'urgencia') return 'border-red-500 ring-4 ring-red-50';
    if (op.urgencia === 'alta') return 'border-orange-500 ring-4 ring-orange-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  const [selectedItemForBreakdown, setSelectedItemForBreakdown] = useState<any | null>(null);

  const updateItemStatus = async (itemCodigo: string, field: 'separado' | 'transferido' | 'falta', value: boolean) => {
    if (!selectedOP) return;

    const updatedItens = selectedOP.rawItens.map((item: any) => {
      if (item.codigo === itemCodigo) {
        return { ...item, [field]: value, falta: field === 'falta' ? value : item.falta };
      }
      return item;
    });

    const { error } = await supabase
      .from('separacao')
      .update({ itens: updatedItens })
      .eq('id', selectedOP.id);

    if (error) {
      alert('Erro ao atualizar item: ' + error.message);
    } else {
      setSelectedOP({ ...selectedOP, rawItens: updatedItens, separados: updatedItens.filter((i: any) => i.separado).length, transferidos: updatedItens.filter((i: any) => i.transferido).length, naoSeparados: updatedItens.filter((i: any) => !i.separado).length });
    }
  };

  const handleFinalizeLot = async () => {
    if (!selectedOP) return;
    if (selectedOP.separados < selectedOP.totalItens) {
      if (!confirm('Existem itens não separados. Deseja finalizar o lote mesmo assim?')) return;
    }

    const { error } = await supabase
      .from('separacao')
      .update({ status: 'concluido', usuario_atual: null })
      .eq('id', selectedOP.id);

    if (error) {
      alert('Erro ao finalizar lote: ' + error.message);
    } else {
      alert('Lote finalizado com sucesso!');
      setViewMode('list');
      setSelectedOP(null);
    }
  };

  const toggleBreakdownItem = (idx: number) => {
    if (!selectedItemForBreakdown) return;
    const newComposicao = [...selectedItemForBreakdown.composicao];
    newComposicao[idx].concluido = !newComposicao[idx].concluido;
    setSelectedItemForBreakdown({ ...selectedItemForBreakdown, composicao: newComposicao });
  };

  const saveBreakdown = async () => {
    if (!selectedItemForBreakdown || !selectedOP) return;

    // Check if everything is OK in breakdown
    const allDone = selectedItemForBreakdown.composicao.every((c: any) => c.concluido);

    const updatedItens = selectedOP.rawItens.map((item: any) => {
      if (item.codigo === selectedItemForBreakdown.codigo) {
        return { ...item, composicao: selectedItemForBreakdown.composicao, separado: allDone };
      }
      return item;
    });

    const { error } = await supabase
      .from('separacao')
      .update({ itens: updatedItens })
      .eq('id', selectedOP.id);

    if (error) {
      alert('Erro ao salvar distribuição: ' + error.message);
    } else {
      setSelectedOP({ ...selectedOP, rawItens: updatedItens, separados: updatedItens.filter((i: any) => i.separado).length });
      setSelectedItemForBreakdown(null);
    }
  };

  if (isSyncing && ops.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse tracking-[0.2em]">Sincronizando Separação...</p>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedOP) {
    return (
      <div className="space-y-6 animate-fadeIn pb-20">
        {/* Modal Lupa (Breakdown per OP) */}
        {selectedItemForBreakdown && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-scaleIn flex flex-col max-h-[90vh]">
              <div className="bg-gray-900 px-8 py-5 flex justify-between items-center text-white shrink-0">
                <h3 className="text-base font-extrabold uppercase tracking-tight">Distribuição por OP</h3>
                <button onClick={() => setSelectedItemForBreakdown(null)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-sm">✕</button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto">
                <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase">Produto Selecionado</p>
                    <p className="text-sm font-black text-gray-900">{selectedItemForBreakdown.codigo}</p>
                    <p className="text-[11px] font-bold text-gray-500 uppercase">{selectedItemForBreakdown.descricao}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Total do Lote</p>
                    <p className="text-2xl font-black text-emerald-600">{selectedItemForBreakdown.quantidade} <span className="text-xs font-bold text-gray-400">{selectedItemForBreakdown.unidade}</span></p>
                  </div>
                </div>
                <div className="space-y-3">
                  {selectedItemForBreakdown.composicao?.map((comp: any, idx: number) => (
                    <div key={idx} className={`flex justify-between items-center p-4 rounded-2xl border transition-all ${comp.concluido ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm border transition-all ${comp.concluido ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white text-gray-400 border-gray-100'}`}>
                          {comp.concluido ? '✓' : `#${idx + 1}`}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase">Ordem de Produção</p>
                          <p className="text-sm font-black text-gray-900">{comp.op}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] font-black text-gray-400 uppercase">Qtd solicitada</p>
                          <p className="text-base font-black text-gray-900">{comp.quantidade} {selectedItemForBreakdown.unidade}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={comp.concluido}
                          onChange={() => toggleBreakdownItem(idx)}
                          className="w-7 h-7 rounded-lg text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer shadow-sm transition-all hover:scale-110"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 p-6 flex justify-end gap-3 shrink-0 border-t border-gray-100">
                <button onClick={() => setSelectedItemForBreakdown(null)} className="px-6 py-3 bg-white border border-gray-200 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all">Cancelar</button>
                <button onClick={saveBreakdown} className="px-10 py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                  Salvar Distribuição
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <button onClick={handleBack} className="w-fit px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2 hover:bg-gray-50 transition-all">
            ← Voltar para Lista
          </button>
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{selectedOP.opCode}</h2>
              <p className="text-[11px] font-bold text-gray-400 uppercase">Armazém: <span className="text-emerald-600">{selectedOP.armazem}</span> | {selectedOP.ordens} Ordens no Lote</p>
            </div>
            <div className="flex gap-3">
              <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex flex-col items-center">
                <span className="text-xs font-black text-emerald-700 leading-none">{selectedOP.separados}/{selectedOP.totalItens}</span>
                <span className="text-[8px] font-black text-emerald-400 uppercase mt-1">Status Geral</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Produtos Ativa */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                  <th className="px-8 py-6">CÓDIGO</th>
                  <th className="px-6 py-6">DESCRIÇÃO / LOCALIZAÇÃO</th>
                  <th className="px-6 py-6 text-center">QTD SOL.</th>
                  <th className="px-6 py-6 text-center">QTD SEP.</th>
                  <th className="px-6 py-6 text-center">AÇÕES</th>
                  <th className="px-8 py-6">OBSERVAÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedOP.rawItens?.map((item: any, idx: number) => {
                  const isBlacklist = blacklist.some(b => b.codigo === item.codigo);
                  return (
                    <tr key={idx} className={`group hover:bg-gray-50/50 transition-all ${item.falta ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black transition-all ${item.separado ? 'bg-emerald-500 shadow-lg shadow-emerald-100' : 'bg-gray-100 text-gray-300'}`}>
                            {item.separado ? '✓' : idx + 1}
                          </div>
                          <button
                            onClick={() => setSelectedItemForBreakdown(item)}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all border shadow-sm ${item.separado ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                          >
                            <span className="text-base">🔍</span>
                          </button>
                          <div>
                            <span className="font-mono text-xs font-black text-gray-700 tracking-tighter uppercase">{item.codigo}</span>
                            {isBlacklist && <span className="block text-[8px] text-red-500 font-bold uppercase mt-0.5">⚠️ Restrição</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-bold text-gray-500 uppercase leading-snug truncate max-w-xs">{item.descricao}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-[9px] font-black text-gray-400 border border-gray-200 rounded-md">A-12-01</span>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-sm text-gray-400 italic">
                        {item.quantidade}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className={`mx-auto w-12 h-10 flex items-center justify-center rounded-xl font-black text-sm border-2 transition-all ${item.separado ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                          {item.separado ? item.quantidade : '0'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateItemStatus(item.codigo, 'separado', !item.separado)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${item.separado ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}
                          >
                            OK
                          </button>
                          <button
                            onClick={() => updateItemStatus(item.codigo, 'transferido', !item.transferido)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${item.transferido ? 'bg-blue-600 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'}`}
                          >
                            TRNS
                          </button>
                          <button
                            onClick={() => updateItemStatus(item.codigo, 'falta', !item.falta)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${item.falta ? 'bg-amber-500 text-white border-amber-400' : 'bg-white text-amber-500 border-amber-100 hover:bg-amber-50'}`}
                          >
                            FLT
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <input type="text" placeholder="..." className="w-full bg-gray-50/50 border-b border-gray-100 px-2 py-1 text-[10px] font-bold outline-none focus:border-emerald-500" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-10 bg-gray-50/50 flex justify-center border-t border-gray-100">
            <button
              onClick={handleFinalizeLot}
              className="px-20 py-5 bg-emerald-800 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-sm hover:bg-emerald-900 transition-all shadow-2xl shadow-emerald-100 active:scale-95"
            >
              Finalizar Lote de Separação
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
      {ops.map((op) => {
        const isLocked = op.usuarioAtual && op.usuarioAtual !== currentResponsavel;
        return (
          <div
            key={op.id}
            className={`bg-white p-5 rounded-[2rem] border-2 transition-all flex flex-col justify-between h-[28rem] relative overflow-hidden ${isLocked ? 'grayscale opacity-60 border-gray-200' : `hover:shadow-2xl ${getStatusBorder(op)}`}`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xl font-black text-gray-300 tracking-tighter">ID {op.id.toString().slice(0, 4)}</span>
                <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${op.urgencia === 'urgencia' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {op.urgencia}
                </span>
              </div>

              {user.role === 'admin' && (
                <button
                  onClick={(e) => handleDelete(op.id, e)}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all z-20 group-hover:scale-110"
                  title="Excluir Registro"
                >
                  <span className="text-sm font-black">✕</span>
                </button>
              )}

              <div>
                <h4 className="text-[22px] font-black text-gray-900 uppercase leading-none tracking-tight">OP {op.opCode}</h4>
                <div className="mt-4 space-y-1.5 text-[10px] font-bold text-gray-500 uppercase">
                  <p className="flex items-center gap-2">📍 Armazém: <span className="text-gray-900 font-black">{op.armazem}</span></p>
                  <p className="flex items-center gap-2">📦 Ordens: <span className="text-gray-900 font-black">{op.ordens}</span></p>
                  <p className="flex items-center gap-2">📋 Itens: <span className="text-gray-900 font-black">{op.totalItens} itens</span></p>
                  <div className="pt-1 mt-1 border-t border-gray-50">
                    <p className="flex items-center gap-2">👤 Responsável: <span className={`font-black ${op.usuarioAtual ? 'text-emerald-700' : 'text-gray-400 italic'}`}>{op.usuarioAtual || 'Aguardando'}</span></p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 grid grid-cols-4 gap-2">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black text-gray-900 leading-none">{op.totalItens}</span>
                  <span className="text-[6px] font-black text-gray-400 uppercase mt-0.5">Total</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-emerald-600 leading-none">{op.separados}</span>
                  <span className="text-[6px] font-black text-emerald-400 uppercase mt-0.5">Sep.</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-blue-600 leading-none">{op.transferidos}</span>
                  <span className="text-[6px] font-black text-blue-400 uppercase mt-0.5">Tra.</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-amber-600 leading-none">{op.naoSeparados}</span>
                  <span className="text-[6px] font-black text-amber-400 uppercase mt-0.5">Falta</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Progresso</p>
                  <p className="text-lg font-black text-emerald-900 leading-none">{op.progresso}%</p>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${op.progresso}%` }}></div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{op.status}</span>
                <span className="text-[8px] font-mono font-bold text-gray-300">{new Date(op.data).toLocaleDateString('pt-BR')}</span>
              </div>
              <button
                onClick={() => handleStart(op)}
                className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-emerald-600 shadow-gray-100'}`}
              >
                {isLocked ? `EM USO: ${op.usuarioAtual}` : 'Iniciar Separação'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Separacao;
