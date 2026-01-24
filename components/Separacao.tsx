
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
          const validItens = rawItens.filter((i: any) => {
            const bl = blacklist.find(b => b.codigo === i.codigo);
            return !(bl?.nao_sep || bl?.talvez);
          });

          return {
            id: item.id,
            opCode: item.nome || item.documento,
            armazem: item.armazem,
            ordens: item.ordens || [],
            totalItens: validItens.length,
            data: item.data_criacao,
            progresso: calculateProgress(rawItens),
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
    const validItens = itens.filter(i => {
      const bl = blacklist.find(b => b.codigo === i.codigo);
      return !(bl?.nao_sep || bl?.talvez);
    });
    if (validItens.length === 0) return 100;
    const separados = validItens.filter(i => i.separado || i.falta).length;
    return Math.round((separados / validItens.length) * 100);
  };

  const getStatusBorder = (op: OPMock) => {
    if (op.urgencia === 'urgencia') return 'border-red-500 ring-4 ring-red-50';
    if (op.urgencia === 'alta') return 'border-orange-500 ring-4 ring-orange-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  const handlePriorityChange = async (id: string, newPriority: UrgencyLevel, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    // NOTA: 'urgencia' parece faltar na tabela, tentando salvar mas pronto para erro
    const { error } = await supabase
      .from('separacao')
      .update({ urgencia: newPriority } as any)
      .eq('id', id);

    if (error) {
      console.warn('Erro ao atualizar prioridade (coluna pode faltar):', error.message);
      // fallback local para UI não travar
      setOps(prev => prev.map(op => op.id === id ? { ...op, urgencia: newPriority } : op));
    } else {
      setOps(prev => prev.map(op => op.id === id ? { ...op, urgencia: newPriority } : op));
    }
  };

  const handleStart = async (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== currentResponsavel) {
      alert(`⚠️ BLOQUEIO DE SEGURANÇA: Esta lista já está sendo processada por "${op.usuarioAtual}".`);
      return;
    }

    const sortedItens = [...op.rawItens].sort((a, b) => {
      const addrA = a.endereco || 'ZZ';
      const addrB = b.endereco || 'ZZ';
      return addrA.localeCompare(addrB);
    }).map(item => {
      const bl = blacklist.find(b => b.codigo === item.codigo);
      if (bl?.nao_sep) return { ...item, falta: true, separado: false, transferido: false };
      return item;
    });

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
      if (item.codigo === itemCodigo) return { ...item, qtd_separada: qtdNum };
      return item;
    });
    setSelectedOP({ ...selectedOP, rawItens: updatedItens });
  };

  const handleSavePending = async () => {
    if (!selectedOP) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('separacao')
      .update({ itens: selectedOP.rawItens })
      .eq('id', selectedOP.id);

    if (error) notify('Erro ao salvar pendência: ' + error.message, 'error');
    else notify('Alterações salvas!', 'success');
    setIsSaving(false);
  };

  const handleFinalizeLot = async () => {
    if (!selectedOP) return;
    if (!docTransferencia) {
      notify('⚠️ Informe o Nº do documento de transferência.', 'warning');
      return;
    }

    const hasPending = selectedOP.rawItens.some(i => {
      const bl = blacklist.find(b => b.codigo === i.codigo);
      if (bl?.nao_sep) return false;
      return !i.separado && !i.falta;
    });

    if (hasPending) {
      notify('❌ Existem itens sem ação (PICK ou OUT).', 'error');
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
      transf: docTransferencia // Ajustado de 'transferencia' para 'transf' conforme logs
    };

    try {
      const { error: insertError } = await supabase.from('conferencia').upsert([finalLotData]);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('separacao')
        .update({ status: 'em_conferencia', usuario_atual: null, itens: selectedOP.rawItens })
        .eq('id', selectedOP.id);
      if (updateError) throw updateError;

      notify('Lote enviado para CONFERÊNCIA!', 'success');
      setViewMode('list'); setSelectedOP(null);
    } catch (e: any) {
      notify('Erro: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  const toggleBreakdownItem = (idx: number) => {
    if (!selectedItemForBreakdown) return;
    const newComposicao = [...selectedItemForBreakdown.composicao];
    newComposicao[idx].concluido = !newComposicao[idx].concluido;
    setSelectedItemForBreakdown({ ...selectedItemForBreakdown, composicao: newComposicao });
  };

  const saveBreakdown = async () => {
    if (!selectedItemForBreakdown || !selectedOP) return;
    const allDone = selectedItemForBreakdown.composicao.every((c: any) => c.concluido);
    const updatedItens = selectedOP.rawItens.map((item: any) => {
      if (item.codigo === selectedItemForBreakdown.codigo) return { ...item, composicao: selectedItemForBreakdown.composicao, separado: allDone };
      return item;
    });
    const { error } = await supabase.from('separacao').update({ itens: updatedItens }).eq('id', selectedOP.id);
    if (error) alert(error.message);
    else { setSelectedOP({ ...selectedOP, rawItens: updatedItens }); setSelectedItemForBreakdown(null); }
  };

  return (
    <div className="space-y-6">
      {isSaving && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center animate-fadeIn">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs font-black text-emerald-900 uppercase">Processando...</p>
        </div>
      )}

      {notification.show && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] px-8 py-4 rounded-2xl shadow-2xl animate-slideUp border ${notification.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-red-600 border-red-400 text-white'
          }`}>
          <p className="text-xs font-black uppercase">{notification.message}</p>
        </div>
      )}

      {viewMode === 'detail' && selectedOP ? (
        <div className="space-y-6 animate-fadeIn pb-20">
          {selectedItemForBreakdown && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="bg-gray-900 px-8 py-5 flex justify-between items-center text-white">
                  <h3 className="text-base font-extrabold uppercase">Distribuição por OP</h3>
                  <button onClick={() => setSelectedItemForBreakdown(null)} className="w-10 h-10 rounded-xl bg-white/10 text-sm">✕</button>
                </div>
                <div className="p-8 space-y-6 overflow-y-auto">
                  {selectedItemForBreakdown.composicao?.map((comp: any, idx: number) => (
                    <div key={idx} className={`flex justify-between items-center p-4 rounded-2xl border ${comp.concluido ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-black text-gray-900">{comp.op}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-base font-black">{comp.quantidade}</span>
                        <input type="checkbox" checked={comp.concluido} onChange={() => toggleBreakdownItem(idx)} className="w-7 h-7" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-50 p-6 flex justify-end gap-3 border-t">
                  <button onClick={saveBreakdown} className="px-10 py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase">Salvar Distribuição</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button onClick={handleBack} className="w-fit px-6 py-2 bg-white border rounded-xl text-[10px] font-bold text-gray-500 uppercase">← Voltar</button>
            <h2 className="text-3xl font-black text-gray-900">OP {selectedOP.opCode}</h2>
          </div>

          <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="bg-gray-50 text-[10px] font-black text-gray-300 uppercase">
                  <th className="px-8 py-6">CÓDIGO</th>
                  <th className="px-6 py-6">DESCRIÇÃO</th>
                  <th className="px-6 py-6 text-center">SOLIC.</th>
                  <th className="px-6 py-6 text-center">SEP.</th>
                  <th className="px-6 py-6 text-center">AÇÕES</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedOP.rawItens?.map((item: any, idx: number) => {
                    const bl = blacklist.find(b => b.codigo === item.codigo);
                    return (
                      <tr key={idx} className={`group ${bl?.nao_sep ? 'bg-red-50' : bl?.talvez ? 'bg-amber-50' : ''}`}>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <button onClick={() => setSelectedItemForBreakdown(item)} className="w-8 h-8 rounded-lg border text-base">🔍</button>
                            <span className="font-mono text-xs font-black">{item.codigo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold line-clamp-1">{item.descricao}</p>
                          <span className="text-[11px] font-black text-emerald-600">📍 {item.endereco || 'S/N'}</span>
                        </td>
                        <td className="px-6 py-5 text-center font-black text-base">{item.quantidade}</td>
                        <td className="px-6 py-5 text-center">
                          <input type="number" value={item.qtd_separada || ''} onChange={(e) => handleUpdateQtd(item.codigo, e.target.value)} className="w-16 h-10 text-center rounded-xl font-black text-sm border-2" />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => updateItemStatus(item.codigo, 'separado', !item.separado)} className={`px-3 py-2 rounded-xl text-[9px] font-black ${item.separado ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-600 border'}`}>PICK</button>
                            <button onClick={() => updateItemStatus(item.codigo, 'falta', !item.falta)} className={`px-3 py-2 rounded-xl text-[9px] font-black ${item.falta ? 'bg-amber-500 text-white' : 'bg-white text-amber-500 border'}`}>OUT</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-8 bg-gray-50 flex gap-4 justify-center">
              <input type="text" value={docTransferencia} onChange={(e) => setDocTransferencia(e.target.value.toUpperCase())} placeholder="Nº DOC TRANSF" className="px-6 py-4 rounded-xl border font-black text-sm" />
              <button onClick={handleSavePending} className="px-10 py-5 bg-white border rounded-2xl font-black text-xs">SALVAR</button>
              <button onClick={handleFinalizeLot} className="px-10 py-5 bg-emerald-800 text-white rounded-2xl font-black text-xs">FINALIZAR</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
          {ops.map((op) => {
            const isLocked = op.usuarioAtual && op.usuarioAtual !== currentResponsavel;
            return (
              <div key={op.id} className={`bg-white p-5 rounded-[2rem] border-2 flex flex-col justify-between h-[28rem] relative ${isLocked ? 'opacity-50' : getStatusBorder(op)}`}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-gray-400">ID {op.id.toString().slice(0, 5)}</span>
                    <select value={op.urgencia} onChange={(e) => handlePriorityChange(op.id, e.target.value as UrgencyLevel, e as any)} className="text-[8px] font-black uppercase rounded-full px-2 py-1 bg-gray-100">
                      <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgencia">Urgência</option>
                    </select>
                  </div>
                  <h4 className="text-xl font-black uppercase">{op.opCode}</h4>
                  <div className="text-[10px] font-bold text-gray-500 uppercase space-y-1">
                    <p>📍 {op.armazem}</p>
                    <p>📦 {op.totalItens} itens</p>
                    <p>👤 {op.usuarioAtual || 'Aguardando'}</p>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full"><div className="h-full bg-emerald-500" style={{ width: `${op.progresso}%` }}></div></div>
                </div>
                <button onClick={() => handleStart(op)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase">Iniciar</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Separacao;
