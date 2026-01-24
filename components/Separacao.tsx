
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
  const [showOPListModal, setShowOPListModal] = useState<{ open: boolean, ops: string[], title: string }>({ open: false, ops: [], title: '' });
  const [notification, setNotification] = useState<{ show: boolean, message: string, type: 'success' | 'error' | 'warning' }>({ show: false, message: '', type: 'success' });

  const notify = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 4000);
  };

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
        const formattedOps: OPMock[] = data.map((item: any) => {
          const rawItens = item.itens || [];
          // Excluir itens da blacklist da contagem total e progresso
          const validItens = rawItens.filter((i: any) => {
            const bl = blacklist.find(b => b.codigo === i.codigo);
            return !(bl?.nao_sep || bl?.talvez);
          });

          return {
            id: item.id,
            opCode: item.nome || item.documento,
            armazem: item.armazem,
            ordens: item.ordens || [],
            totalItens: validItens.length, // Total apenas de itens "separáveis"
            data: item.data_criacao,
            progresso: calculateProgress(rawItens), // Função ajustada abaixo
            urgencia: item.urgencia || 'media',
            status: item.status,
            usuarioAtual: item.usuario_atual,
            observacao: item.observacao,
            separados: validItens.filter((i: any) => i.separado).length || 0,
            transferidos: validItens.filter((i: any) => i.transferido).length || 0,
            naoSeparados: validItens.filter((i: any) => !i.separado && !i.falta).length || 0,
            rawItens: rawItens,
          };
        });
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
    // Filtrar itens válidos (não blacklist)
    const validItens = itens.filter(i => {
      const bl = blacklist.find(b => b.codigo === i.codigo);
      return !(bl?.nao_sep || bl?.talvez);
    });
    if (validItens.length === 0) return 100; // Se tudo for blacklist, progresso concluído?
    const separados = validItens.filter(i => i.separado || i.falta).length;
    return Math.round((separados / validItens.length) * 100);
  };

  const getStatusBorder = (op: OPMock) => {
    if (op.urgencia === 'urgencia') return 'border-red-500 ring-4 ring-red-50';
    if (op.urgencia === 'alta') return 'border-orange-500 ring-4 ring-orange-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  const getLockIndicator = (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== currentResponsavel) {
      return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gray-900/90 backdrop-blur-sm rounded-full border border-white/10 flex items-center gap-2 z-30 shadow-2xl animate-bounce">
          <span className="text-[10px] font-black text-white uppercase tracking-widest whitespace-nowrap">👀 Aberto por: {op.usuarioAtual}</span>
        </div>
      );
    }
    return null;
  };

  const handlePriorityChange = async (id: string, newPriority: UrgencyLevel, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('separacao')
      .update({ urgencia: newPriority })
      .eq('id', id);

    if (error) {
      notify('Erro ao atualizar prioridade: ' + error.message, 'error');
    } else {
      setOps(prev => prev.map(op => op.id === id ? { ...op, urgencia: newPriority } : op));
    }
  };

  const handleStart = async (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== currentResponsavel) {
      alert(`⚠️ BLOQUEIO DE SEGURANÇA: Esta lista já está sendo processada por "${op.usuarioAtual}".`);
      return;
    }

    // Sort items by location (Picking Path) before opening
    const sortedItens = [...op.rawItens].sort((a, b) => {
      const addrA = a.endereco || 'ZZ';
      const addrB = b.endereco || 'ZZ';
      return addrA.localeCompare(addrB);
    }).map(item => {
      // Auto-mark Blacklist NÃO SEP
      const bl = blacklist.find(b => b.codigo === item.codigo);
      if (bl?.nao_sep) {
        return { ...item, falta: true, separado: false, transferido: false };
      }
      return item;
    });

    // Set lock in Supabase
    const { error } = await supabase
      .from('separacao')
      .update({ usuario_atual: currentResponsavel })
      .eq('id', op.id);

    if (error) {
      alert('Erro ao iniciar separação: ' + error.message);
      return;
    }

    setSelectedOP({ ...op, rawItens: sortedItens, usuarioAtual: currentResponsavel });
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

  const [selectedItemForBreakdown, setSelectedItemForBreakdown] = useState<any | null>(null);
  const [docTransferencia, setDocTransferencia] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const updateItemStatus = async (itemCodigo: string, field: 'separado' | 'transferido' | 'falta', value: boolean) => {
    if (!selectedOP) return;

    const updatedItens = selectedOP.rawItens.map((item: any) => {
      if (item.codigo === itemCodigo) {
        let newItem = { ...item, [field]: value, falta: field === 'falta' ? value : item.falta };

        // Sincronizar PICK manual com checklist da lupa (composicao)
        if (field === 'separado' && value === true && newItem.composicao) {
          newItem.composicao = newItem.composicao.map((c: any) => ({ ...c, concluido: true }));
        }

        return newItem;
      }
      return item;
    });

    const validItens = updatedItens.filter((i: any) => {
      const bl = blacklist.find(b => b.codigo === i.codigo);
      return !(bl?.nao_sep || bl?.talvez);
    });

    setSelectedOP({
      ...selectedOP,
      rawItens: updatedItens,
      progresso: calculateProgress(updatedItens),
      totalItens: validItens.length,
      separados: validItens.filter((i: any) => i.separado).length,
      transferidos: validItens.filter((i: any) => i.transferido).length,
      naoSeparados: validItens.filter((i: any) => !i.separado && !i.falta).length
    });
  };

  const handleUpdateQtd = (itemCodigo: string, newQtd: string) => {
    if (!selectedOP) return;
    const qtdNum = Number(newQtd) || 0;
    const updatedItens = selectedOP.rawItens.map((item: any) => {
      if (item.codigo === itemCodigo) {
        return { ...item, qtd_separada: qtdNum };
      }
      return item;
    });
    setSelectedOP({ ...selectedOP, rawItens: updatedItens });
  };

  const handleSavePending = async () => {
    if (!selectedOP) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('separacao')
      .update({
        itens: selectedOP.rawItens,
        // Também atualizar o status local no banco se necessário
      })
      .eq('id', selectedOP.id);

    if (error) {
      notify('Erro ao salvar pendência: ' + error.message, 'error');
    } else {
      notify('Alterações salvas com sucesso!', 'success');
      // Atualizar a lista principal para refletir os novos dados
      setOps(prev => prev.map(op => op.id === selectedOP.id ? { ...op, rawItens: selectedOP.rawItens, progresso: calculateProgress(selectedOP.rawItens) } : op));
    }
    setIsSaving(false);
  };

  const handleFinalizeLot = async () => {
    if (!selectedOP) return;
    if (!docTransferencia) {
      notify('⚠️ CAMPO OBRIGATÓRIO: Informe o Nº do documento de transferência.', 'warning');
      return;
    }

    // Validação: Itens processados (Separados OU Falta). Ignora-se Blacklist.
    const hasPending = selectedOP.rawItens.some(i => {
      const bl = blacklist.find(b => b.codigo === i.codigo);
      if (bl?.nao_sep) return false;
      return !i.separado && !i.falta; // Agora permite OUT (falta) finalizar
    });

    if (hasPending) {
      notify('❌ BLOQUEIO: Existem itens sem ação (PICK ou OUT).', 'error');
      return;
    }

    setIsSaving(true);

    const finalLotData = {
      id: selectedOP.id,
      documento: selectedOP.id.startsWith('LOTE-') ? selectedOP.id : `LOTE-${selectedOP.id}`,
      nome: selectedOP.opCode,
      armazem: selectedOP.armazem,
      ordens: selectedOP.ordens,
      itens: selectedOP.rawItens,
      status: 'Aguardando',
      data_conferencia: new Date().toISOString(),
      responsavel_conferencia: null,
      transf: docTransferencia
    };

    try {
      // 1. Inserir/Atualizar na tabela de conferencia
      const { error: insertError } = await supabase
        .from('conferencia')
        .upsert([finalLotData]);

      if (insertError) throw insertError;

      // 2. Atualizar status na tabela de separacao
      const { error: updateError } = await supabase
        .from('separacao')
        .update({
          status: 'em_conferencia',
          usuario_atual: null,
          itens: selectedOP.rawItens
        })
        .eq('id', selectedOP.id);

      if (updateError) throw updateError;

      // 3. TEA AUTOMATIC UPDATE: Update TEA to "Qualidade"
      const { data: teaData } = await supabase
        .from('historico')
        .select('*')
        .eq('op', selectedOP.opCode) // Using opCode which might be the OP or part of it
        .maybeSingle();

      if (teaData) {
        const newFluxo = [...(teaData.fluxo || []), {
          status: 'Qualidade',
          icon: '🔍',
          data: new Date().toLocaleDateString('pt-BR')
        }];
        await supabase
          .from('historico')
          .update({ fluxo: newFluxo })
          .eq('op', selectedOP.opCode);
      }

      notify('Lote enviado para CONFERÊNCIA!', 'success');
      setViewMode('list');
      setSelectedOP(null);
    } catch (error: any) {
      notify('Erro ao finalizar fluxo: ' + error.message, 'error');
    } finally {
      setIsSaving(false);
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

  return (
    <div className="space-y-6">
      {/* Full screen saving overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center animate-fadeIn">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs font-black text-emerald-900 uppercase tracking-[0.3em] animate-pulse">Processando Operação...</p>
        </div>
      )}

      {/* Custom Notification (Toast) */}
      {notification.show && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] px-8 py-4 rounded-2xl shadow-2xl animate-slideUp flex items-center gap-4 border ${notification.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : notification.type === 'error' ? 'bg-red-600 border-red-400 text-white' : 'bg-amber-500 border-amber-300 text-white'
          }`}>
          <span className="text-xl">{notification.type === 'success' ? '✅' : notification.type === 'error' ? '❌' : '⚠️'}</span>
          <p className="text-xs font-black uppercase tracking-widest">{notification.message}</p>
        </div>
      )}

      {/* Custom Modal for OP List */}
      {showOPListModal.open && (
        <div className="fixed inset-0 bg-black/40 z-[900] flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scaleIn border border-gray-100">
            <div className="bg-gray-900 p-8 flex justify-between items-center text-white">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Lista de OPs do Lote</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{showOPListModal.title}</p>
              </div>
              <button onClick={() => setShowOPListModal({ open: false, ops: [], title: '' })} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm">✕</button>
            </div>
            <div className="p-10 space-y-4 max-h-[50vh] overflow-y-auto">
              {showOPListModal.ops && showOPListModal.ops.length > 0 ? (
                showOPListModal.ops.map((opId, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-emerald-200 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:text-emerald-600 group-hover:border-emerald-100 shadow-sm transition-all">{idx + 1}</div>
                    <span className="font-mono text-sm font-black text-gray-800 tracking-tighter uppercase">{String(opId)}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs font-black text-gray-300 uppercase tracking-widest italic">OP Única</p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 p-8 flex justify-end border-t border-gray-100">
              <button onClick={() => setShowOPListModal({ open: false, ops: [], title: '' })} className="px-12 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'detail' && selectedOP ? (
        <div className="space-y-6 animate-fadeIn pb-20">
          {/* Modal Lupa (Breakdown per OP) */}
          {selectedItemForBreakdown && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-scaleIn flex flex-col max-h-[90vh] border border-gray-100">
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
                <p className="text-[11px] font-bold text-gray-400 uppercase">Armazém: <span className="text-emerald-600">{selectedOP.armazem}</span> | {(selectedOP.ordens as any)?.length || 1} Ordens no Lote</p>
              </div>
              <div className="flex gap-3">
                <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex flex-col items-center">
                  <span className="text-xs font-black text-emerald-700 leading-none">{selectedOP.separados}/{selectedOP.totalItens}</span>
                  <span className="text-[8px] font-black text-emerald-400 uppercase mt-1">Status Geral</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6">
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-50 rounded-2xl p-6 flex flex-col justify-center">
                <p className="text-4xl font-black text-gray-900 leading-none mb-2">{selectedOP.totalItens}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Itens</p>
              </div>
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 flex flex-col justify-center">
                <p className="text-4xl font-black text-emerald-600 leading-none mb-2">{selectedOP.separados}/{selectedOP.totalItens}</p>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Separados</p>
              </div>
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 flex flex-col justify-center">
                <p className="text-4xl font-black text-blue-600 leading-none mb-2">{selectedOP.transferidos}/{selectedOP.totalItens}</p>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Transferidos</p>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-6 flex flex-col justify-center">
                <p className="text-4xl font-black text-amber-600 leading-none mb-2">{selectedOP.totalItens - (selectedOP.separados + selectedOP.naoSeparados)}</p>
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pendentes</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 w-full lg:w-96 shrink-0 text-left">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 block tracking-widest">Documento de Transferência</label>
                <input
                  type="text"
                  value={docTransferencia}
                  onChange={(e) => setDocTransferencia(e.target.value.toUpperCase())}
                  placeholder="Ex: TRNS-999"
                  className="w-full text-sm font-black text-gray-800 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500/10 placeholder-gray-300"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                    <th className="px-8 py-6">CÓDIGO</th>
                    <th className="px-6 py-6">DESCRIÇÃO / LOCALIZAÇÃO</th>
                    <th className="px-6 py-6 text-center">SOLIC.</th>
                    <th className="px-6 py-6 text-center">SEP.</th>
                    <th className="px-6 py-6 text-center">AÇÕES</th>
                    <th className="px-8 py-6">OBSERVAÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedOP.rawItens?.map((item: any, idx: number) => {
                    const bl = blacklist.find(b => b.codigo === item.codigo);
                    const isBlocked = bl?.nao_sep || false;
                    const isMaybe = bl?.talvez || false;
                    const tooMuch = (item.qtd_separada || 0) > item.quantidade;

                    return (
                      <tr key={idx} className={`group hover:bg-gray-50/30 transition-all ${isBlocked ? 'bg-red-50/60 border-l-8 border-red-500' : isMaybe ? 'bg-amber-50/40 border-l-8 border-amber-400' : item.falta ? 'bg-amber-50/20' : ''}`}>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black transition-all ${item.separado ? 'bg-emerald-500 shadow-lg shadow-emerald-100' : isBlocked ? 'bg-red-500' : isMaybe ? 'bg-amber-500' : 'bg-gray-100 text-gray-300'}`}>
                              {item.separado ? '✓' : isBlocked ? '✕' : isMaybe ? '?' : idx + 1}
                            </div>
                            <button
                              onClick={() => setSelectedItemForBreakdown(item)}
                              disabled={isBlocked}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all border shadow-sm ${item.separado ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : isBlocked ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                            >
                              <span className="text-base font-black">🔍</span>
                            </button>
                            <div>
                              <span className="font-mono text-xs font-black text-gray-700 tracking-tighter uppercase">{item.codigo}</span>
                              {isBlocked && <span className="block text-[8px] text-red-600 font-extrabold uppercase mt-0.5">⚠️ NÃO SEPARAR</span>}
                              {isMaybe && <span className="block text-[8px] text-amber-600 font-extrabold uppercase mt-0.5">❓ TALVEZ</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-gray-500 uppercase leading-snug line-clamp-1 max-w-sm">{item.descricao}</p>
                          <span className="inline-block mt-1.5 px-3 py-1 bg-gray-900 border border-gray-800 text-[11px] font-black text-white rounded-lg shadow-sm">📍 {item.endereco || 'S/N'}</span>
                        </td>
                        <td className="px-6 py-5 text-center font-black text-base text-gray-400">
                          {item.quantidade}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input
                            type="number"
                            disabled={isBlocked}
                            value={item.qtd_separada || ''}
                            onChange={(e) => handleUpdateQtd(item.codigo, e.target.value)}
                            className={`w-16 h-10 text-center rounded-xl font-black text-sm border-2 transition-all outline-none ${isBlocked ? 'bg-gray-100 border-gray-100 text-gray-300' : tooMuch ? 'bg-red-50 border-red-500 text-red-600 animate-pulse' : 'bg-gray-50 border-gray-100 text-gray-800 focus:bg-white focus:border-emerald-500'}`}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              disabled={isBlocked}
                              onClick={() => updateItemStatus(item.codigo, 'separado', !item.separado)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${item.separado ? 'bg-emerald-600 text-white border-emerald-500' : isBlocked ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}
                            >
                              PICK
                            </button>
                            <button
                              disabled={isBlocked}
                              onClick={() => updateItemStatus(item.codigo, 'transferido', !item.transferido)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${item.transferido ? 'bg-blue-600 text-white border-blue-500' : isBlocked ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'}`}
                            >
                              TRA
                            </button>
                            <button
                              disabled={isBlocked}
                              onClick={() => updateItemStatus(item.codigo, 'falta', !item.falta)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${item.falta ? 'bg-amber-500 text-white border-amber-400' : isBlocked ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-amber-500 border-amber-100 hover:bg-amber-50'}`}
                            >
                              OUT
                            </button>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <input type="text" placeholder="Observação..." className="w-full bg-transparent border-b border-gray-100 px-2 py-1 text-[10px] font-bold outline-none focus:border-gray-300" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-10 bg-gray-50/50 flex flex-col md:flex-row justify-center gap-4 border-t border-gray-100">
              <button
                onClick={handleSavePending}
                disabled={isSaving}
                className="px-12 py-5 bg-white border border-gray-200 text-gray-600 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-sm hover:bg-gray-50 transition-all shadow-sm active:scale-95"
              >
                {isSaving ? 'Processando...' : 'Salvar Pendência'}
              </button>
              <button
                onClick={handleFinalizeLot}
                disabled={isSaving}
                className="px-20 py-5 bg-emerald-800 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-sm hover:bg-emerald-900 transition-all shadow-2xl shadow-emerald-100 active:scale-95"
              >
                {isSaving ? 'Processando...' : 'Finalizar e Enviar p/ Conferência'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
          {ops.map((op) => {
            const isLocked = op.usuarioAtual && op.usuarioAtual !== currentResponsavel;
            return (
              <div
                key={op.id}
                className={`bg-white p-5 rounded-[2rem] border-2 transition-all flex flex-col justify-between h-[28rem] relative overflow-hidden ${isLocked ? 'grayscale opacity-60 border-gray-200' : `hover:shadow-2xl ${getStatusBorder(op)}`}`}
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-left mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-gray-400 tracking-tighter shrink-0">ID {op.id.toString().slice(0, 5)}</span>
                      <select
                        value={op.urgencia}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handlePriorityChange(op.id, e.target.value as UrgencyLevel, e)}
                        className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest outline-none border-none cursor-pointer transition-all ${op.urgencia === 'urgencia' ? 'bg-red-600 text-white shadow-lg shadow-red-200' :
                          op.urgencia === 'alta' ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' :
                            'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="urgencia">Urgência</option>
                      </select>
                    </div>
                  </div>

                  {user.role === 'admin' && (
                    <button
                      onClick={(e) => handleDelete(op.id, e)}
                      className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all z-20"
                      title="Excluir Registro"
                    >
                      <span className="text-sm font-black">✕</span>
                    </button>
                  )}

                  <div className="text-left">
                    <div className="flex items-center gap-3">
                      <h4 className="text-[17px] font-black text-gray-900 uppercase leading-none tracking-tight">{op.opCode}</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowOPListModal({ open: true, ops: op.ordens as unknown as string[], title: op.opCode });
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-gray-100 shadow-sm"
                      >
                        <span className="text-base">🔍</span>
                      </button>
                    </div>
                    <div className="mt-4 space-y-1.5 text-[10px] font-bold text-gray-500 uppercase">
                      <p className="flex items-center gap-2">📍 Armazém: <span className="text-gray-900 font-black">{op.armazem}</span></p>
                      <p className="flex items-center gap-2">📦 Ordens: <span className="text-gray-900 font-black">{(op.ordens as any)?.length || 1}</span></p>
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
                      <span className="text-xs font-black text-emerald-600 leading-none">{op.separados}/{op.totalItens}</span>
                      <span className="text-[6px] font-black text-emerald-400 uppercase mt-0.5">Sep.</span>
                    </div>
                    <div className="flex flex-col items-center border-l border-gray-100">
                      <span className="text-xs font-black text-blue-600 leading-none">{op.transferidos}/{op.totalItens}</span>
                      <span className="text-[6px] font-black text-blue-400 uppercase mt-0.5">Tra.</span>
                    </div>
                    <div className="flex flex-col items-center border-l border-gray-100">
                      <span className="text-xs font-black text-amber-600 leading-none">{op.naoSeparados}/{op.totalItens}</span>
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
                    className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-emerald-600 shadow-gray-200'}`}
                  >
                    {isLocked ? `EM USO: ${op.usuarioAtual}` : 'Iniciar Separação'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Separacao;
