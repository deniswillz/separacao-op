
import React, { useState, useEffect } from 'react';
import { UrgencyLevel, User } from '../types';
import { BlacklistItem } from '../App';
import { supabase } from '../services/supabaseClient';
import Loading from './Loading';
import { useAlert } from './AlertContext';



interface OPMock {
  id: string;
  opCode: string;
  armazem: string;
  ordens: string[];
  totalItens: number;
  data: string;
  progresso: number;
  urgencia: UrgencyLevel;
  status: string;
  usuarioAtual?: string | null;
  separados: number;
  faltas: number;
  rawItens: any[];
}

const Separacao: React.FC<{ blacklist: BlacklistItem[], user: User, setActiveTab: (tab: string) => void }> = ({ blacklist, user, setActiveTab }) => {
  const { showAlert } = useAlert();
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const [isSyncing, setIsSyncing] = useState(true);
  const [ops, setOps] = useState<OPMock[]>([]);
  const [selectedOP, setSelectedOP] = useState<OPMock | null>(null);
  const [docTransferencia, setDocTransferencia] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showLupaModal, setShowLupaModal] = useState(false);
  const [lupaItem, setLupaItem] = useState<any | null>(null);
  const [enderecos, setEnderecos] = useState<any[]>([]);


  const [showOpListModal, setShowOpListModal] = useState(false);
  const [selectedOpForList, setSelectedOpForList] = useState<any>(null);
  const [showObsModal, setShowObsModal] = useState(false);
  const [obsItem, setObsItem] = useState<any | null>(null);
  const [manualSeparador, setManualSeparador] = useState(user.nome);

  const fetchOps = async () => {
    setIsSyncing(true);
    const { data, error } = await supabase.from('separacao').select('*').order('data_criacao', { ascending: false });

    if (error) console.error(error);
    else if (data) {
      setOps(data.map((item: any) => {
        const itensArr = Array.isArray(item.itens) ? item.itens : [];
        const sepCount = itensArr.filter((i: any) => i.separado).length;
        const faltCount = itensArr.filter((i: any) => i.falta).length;

        return {
          id: item.id,
          opCode: item.nome || item.documento,
          armazem: item.armazem,
          ordens: item.ordens || [],
          totalItens: itensArr.length,
          data: item.data_criacao,
          progresso: calculateProgress(itensArr),
          urgencia: item.urgencia || 'media',
          status: item.status,
          usuarioAtual: item.usuario_atual,
          separados: sepCount,
          faltas: faltCount,
          transferidos: itensArr.filter((i: any) => i.transferido).length,
          rawItens: itensArr

        };
      }));
    }
    setIsSyncing(false);
  };

  const fetchEnderecos = async () => {
    const { data } = await supabase.from('enderecos').select('*');
    if (data) setEnderecos(data);
  };

  useEffect(() => {
    fetchOps();
    fetchEnderecos();
    const channel = supabase.channel('separacao-live').on('postgres_changes', { event: '*', schema: 'public', table: 'separacao' }, fetchOps).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const calculateProgress = (itens: any[]) => {
    if (!itens || itens.length === 0) return 0;

    // Count items matching the detail table logic: filtered by blacklist and considered "done"
    const validItens = itens.filter(i => {
      const b = blacklist.find(bl => bl.sku === i.codigo || (bl as any).codigo === i.codigo);
      return !b?.nao_sep;
    });

    if (validItens.length === 0) return 0;

    const count = validItens.filter(i => {
      if (i.falta) return true;
      const isLupaDone = i.composicao?.every((c: any) => c.concluido) &&
        i.composicao?.reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0) >= i.quantidade;
      return i.ok && isLupaDone && i.tr;
    }).length;

    return Math.round((count / validItens.length) * 100);
  };


  const handleStart = async (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== user.nome) {
      alert(`⚠️ Bloqueio: Em uso por "${op.usuarioAtual}"`);
      return;
    }
    await supabase.from('separacao').update({ usuario_atual: user.nome }).eq('id', op.id);
    setSelectedOP({ ...op, usuarioAtual: user.nome });
    setManualSeparador(user.nome);
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedOP) await supabase.from('separacao').update({ usuario_atual: null }).eq('id', selectedOP.id);
    setViewMode('list'); setSelectedOP(null);
  };

  const updateLupaQuantity = async (itemCodigo: string, op: string, newQty: number) => {
    if (!selectedOP) return;

    const newItens = selectedOP.rawItens.map(item => {
      if (item.codigo === itemCodigo) {
        const newComp = (item.composicao || []).map((c: any) => {
          if (c.op === op) {
            const requested = c.quantidade_original || c.quantidade || 0;
            return {
              ...c,
              qtd_separada: newQty,
              concluido: c.concluido // Leave as is unless explicitly toggled by OK button
            };
          }
          return c;
        });

        const newTotalSeparated = newComp.reduce((sum: number, c: any) => sum + (Number(c.qtd_separada) || 0), 0);

        return {
          ...item,
          composicao: newComp,
          qtd_separada: newTotalSeparated
        };
      }
      return item;
    });

    setIsFinalizing(true);
    const { error } = await supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id);
    setIsFinalizing(false);

    if (!error) {
      const updatedOP = { ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) };
      setSelectedOP(updatedOP);
      const updatedLupaItem = newItens.find(i => i.codigo === itemCodigo);
      if (updatedLupaItem) setLupaItem(updatedLupaItem);
    } else {
      showAlert('Erro ao atualizar quantidade: ' + error.message, 'error');
    }
  };

  const updateLupaStatus = async (itemCodigo: string, op: string, isFinalize: boolean) => {
    if (!selectedOP) return;

    const newItens = selectedOP.rawItens.map(item => {
      if (item.codigo === itemCodigo) {
        const newComp = (item.composicao || []).map((c: any) => {
          if (c.op === op) {
            return {
              ...c,
              concluido: isFinalize,
              qtd_separada: isFinalize ? (c.qtd_separada || c.quantidade_original || c.quantidade || 0) : 0
            };
          }
          return c;
        });

        const newTotalSeparated = newComp.reduce((sum: number, c: any) => sum + (Number(c.qtd_separada) || 0), 0);

        return {
          ...item,
          composicao: newComp,
          qtd_separada: newTotalSeparated
        };
      }
      return item;
    });

    setIsFinalizing(true);
    const { error } = await supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id);
    setIsFinalizing(false);

    if (!error) {
      const updatedOP = { ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) };
      setSelectedOP(updatedOP);
      const updatedLupaItem = newItens.find(i => i.codigo === itemCodigo);
      if (updatedLupaItem) setLupaItem(updatedLupaItem);
    } else {
      showAlert('Erro ao atualizar status: ' + error.message, 'error');
    }
  };

  const updateItem = async (itemCodigo: string, field: string, value: any) => {
    if (!selectedOP) return;
    const newItens = selectedOP.rawItens.map(i => i.codigo === itemCodigo ? { ...i, [field]: value } : i);

    setIsFinalizing(true);
    // Auto-save to DB instantly
    const { error } = await supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id);
    setIsFinalizing(false);

    if (!error) {
      setSelectedOP({ ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) });
    } else {
      console.error('Erro ao auto-salvar item:', error);
      showAlert('Erro ao auto-salvar item: ' + error.message, 'error');
    }
  };

  const getOPDisplayRange = (ordens: string[]) => {
    if (!ordens || ordens.length === 0) return 'S/N';
    const formatted = ordens.map(op => {
      // Logic: remove 00 at start and 01001 at end
      return op.replace(/^00/, '').replace(/01001$/, '');
    });
    const unique = Array.from(new Set(formatted)).sort();
    return unique.length > 1 ? `${unique[0]} - ${unique[unique.length - 1]}` : unique[0] || 'S/N';
  };

  const handleFinalize = async () => {
    if (!selectedOP || !docTransferencia) {
      showAlert('Informe o Documento de Transferência', 'warning');
      return;
    }

    const isComplete = selectedOP.rawItens.every(i => {
      const blacklistItem = blacklist.find(b => b.sku === i.codigo || (b as any).codigo === i.codigo);
      if (blacklistItem?.nao_sep) return true;
      if (i.falta) return true;

      // If item is marked as OK, it must have Lupa and TR finished.
      // If not marked as OK, it is skipped (OUT) and doesn't block finalization.
      if (i.ok) {
        const isLupaDone = i.composicao?.every((c: any) => c.concluido);
        return isLupaDone && i.tr;
      }
      return true;
    });

    if (!isComplete) {
      showAlert('PROCESSO IMPEDIDO: Itens marcados como OK devem ter a Lupa finalizada e o Check TR marcado.', 'error');
      return;
    }

    setIsFinalizing(true);

    const conferenceData = {
      documento: `CC-${selectedOP.opCode}`,
      nome: selectedOP.opCode,
      armazem: selectedOP.armazem,
      ordens: selectedOP.ordens,
      itens: selectedOP.rawItens
        .map((item: any) => {
          const actualQtd = item.composicao?.reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0) ?? 0;
          return {
            ...item,
            quantidade: actualQtd,
            original_solicitado: item.quantidade,
            doc_transferencia: docTransferencia,
            usuario_atual: manualSeparador || user.nome
          };
        }),
      status: 'Aguardando'
    };



    try {
      const { error: confErr } = await supabase.from('conferencia').insert([conferenceData]);
      if (confErr) throw confErr;

      await supabase.from('separacao').delete().eq('id', selectedOP.id);

      // TEA Sync: Update status to 'Conferência' for all OPs in the lot
      if (selectedOP.ordens && selectedOP.ordens.length > 0) {
        for (const opId of selectedOP.ordens) {
          const { data: teaList } = await supabase.from('historico')
            .select('*')
            .eq('armazem', 'TEA')
            .filter('documento', 'eq', opId);

          const tea = teaList?.[0];
          if (tea) {
            const newFluxo = [...(tea.itens || []), {
              status: 'Conferência',
              icon: '🔍',
              data: new Date().toLocaleDateString('pt-BR')
            }];
            await supabase.from('historico').update({
              itens: newFluxo
            }).eq('documento', opId).eq('armazem', 'TEA');
          }
        }
      }

      // Artificial delay to ensure user perceives the transition
      await new Promise(resolve => setTimeout(resolve, 800));

      setViewMode('list'); setSelectedOP(null);
      setActiveTab('conferencia');
    } catch (e: any) {
      showAlert('Erro ao finalizar: ' + e.message, 'error');
    } finally { setIsFinalizing(false); }
  };

  const handleSaveObs = async (sku: string, op: string, text: string) => {
    if (!selectedOP) return;
    const newItens = selectedOP.rawItens.map(item => {
      if (item.codigo === sku) {
        const newComp = (item.composicao || []).map((c: any) => c.op === op ? { ...c, observacao: text } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });

    const { error } = await supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id);
    if (error) showAlert('Erro ao salvar observação: ' + error.message, 'error');
    else setSelectedOP({ ...selectedOP, rawItens: newItens });
  };

  const getUrgencyStyles = (urg: string) => {
    if (urg === 'urgencia' || urg === 'URGENCIA') return { border: 'border-red-500', text: 'text-red-500', bg: 'bg-red-50' };
    if (urg === 'alta' || urg === 'ALTA') return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-50' };
    return { border: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-50' };
  };

  if (isSyncing && ops.length === 0) {
    return <Loading message="Sincronizando Separação..." />;
  }


  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-[var(--bg-secondary)] p-4 rounded-xl border-l-4 border-[#006B47] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Seleção de OP</h1>
          {isFinalizing && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full animate-pulse border border-emerald-100">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-[9px] font-black uppercase">Sincronizando...</span>
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-gray-400 uppercase">
          Data do Sistema: <span className="text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      {viewMode === 'detail' && selectedOP ? (
        <div className="space-y-6 animate-fadeIn">
          <button onClick={handleBack} className="px-6 py-2 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-inner)] transition-all">← Voltar</button>

          <div className="bg-[var(--bg-secondary)] rounded-[2.5rem] border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="bg-[var(--bg-inner)]/50 p-8 border-b border-[var(--border-light)] flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center text-xl font-black">📦</div>
                <h2 className="text-2xl font-black tracking-tight uppercase">Seleção de OP</h2>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right bg-[var(--bg-secondary)] p-2 px-4 rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)]">
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase">Separador</p>
                  <input
                    type="text"
                    value={manualSeparador}
                    onChange={(e) => setManualSeparador(e.target.value.toUpperCase())}
                    className="text-xs font-black text-[#006B47] text-right bg-transparent border-none p-0 focus:ring-0 uppercase w-32"
                  />
                </div>
                <input
                  value={docTransferencia}
                  onChange={e => setDocTransferencia(e.target.value.toUpperCase())}
                  placeholder="Nº DOC DE TRANSFERÊNCIA"
                  className="px-6 py-4 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all w-64 text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[var(--bg-inner)] text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  <tr>
                    <th className="px-8 py-5 text-center">LUPA</th>
                    <th className="px-8 py-5">PRODUTO</th>
                    <th className="px-6 py-5 text-center">SOLICITADO</th>
                    <th className="px-6 py-5 text-center">SEPARADO</th>
                    <th className="px-10 py-5 text-center">AÇÕES</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-light)]">
                  {selectedOP.rawItens
                    .sort((a, b) => a.codigo.localeCompare(b.codigo))
                    .filter(item => {
                      const blacklistItem = blacklist.find(b => b.sku === item.codigo || (b as any).codigo === item.codigo);
                      return !blacklistItem?.nao_sep; // Hide if NÃO SEPARAR
                    })
                    .map((item, idx) => {
                      const blacklistItem = blacklist.find(b => b.sku === item.codigo || (b as any).codigo === item.codigo);
                      const isTalvez = blacklistItem?.talvez;

                      const enderecoData = enderecos.find(e => e.codigo === item.codigo);
                      const armazem = enderecoData?.armazem || selectedOP.armazem || '--';
                      const endereco = enderecoData?.endereco || '--';

                      const isOut = !!item.falta;
                      const isLupaDone = item.composicao?.every((c: any) => c.concluido) &&
                        item.composicao?.reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0) >= item.quantidade;

                      const isDone = item.ok && isLupaDone && item.tr;

                      const rowClass = isOut ? 'bg-red-50 border-l-4 border-red-500' :
                        isDone ? 'bg-emerald-50/80 border-l-4 border-emerald-500' :
                          isTalvez ? 'border-l-4 border-amber-500' : 'border-l-4 border-transparent';

                      return (
                        <tr key={idx} className={`group ${rowClass} transition-all border-b border-[var(--border-light)] hover:bg-[var(--bg-inner)]/30`}>
                          <td className="px-8 py-6 text-center">
                            <button
                              disabled={isOut}
                              onClick={() => { setLupaItem(item); setShowLupaModal(true); }}
                              className={`w-12 h-12 rounded-xl text-lg transition-all flex items-center justify-center border ${isOut ? 'opacity-20 cursor-not-allowed bg-gray-100' :
                                isLupaDone
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/10 font-bold'
                                  : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-muted)] hover:bg-[var(--bg-inner)]'
                                }`}
                              title="LUPA - Distribuição p/ OP"
                            >
                              🔍
                            </button>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-[var(--text-primary)] text-sm font-mono tracking-tighter">
                                {item.codigo}
                              </p>
                              {isTalvez && <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] rounded-full uppercase">TALVEZ</span>}
                              <button
                                onClick={() => { setObsItem(item); setShowObsModal(true); }}
                                className={`text-xs hover:scale-125 transition-transform ${item.composicao?.some((c: any) => c.observacao) ? 'text-blue-500' : 'text-gray-300'}`}
                                title="Observações / Notas (🗨️)"
                              >
                                🗨️
                              </button>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight mb-2">{item.descricao}</p>
                            <div className="flex items-center gap-4 text-[9px] font-black uppercase text-[var(--text-muted)]">
                              <p>.Armazém: <span className="text-[var(--text-primary)]">{armazem}</span></p>
                              <p>Endereço: <span className="text-emerald-600 font-mono tracking-widest">{endereco}</span></p>
                            </div>
                          </td>
                          <td className="px-6 py-6 text-center text-lg font-black text-[var(--text-primary)]">{item.quantidade}</td>
                          <td className="px-6 py-6 text-center">
                            <input
                              type="number"
                              disabled={isOut}
                              className={`w-20 px-3 py-2 bg-[var(--bg-secondary)] border rounded-xl text-center font-black text-sm outline-none transition-all ${isOut ? 'opacity-20 bg-[var(--bg-inner)]' : item.qtd_separada > item.quantidade ? 'border-red-500 ring-4 ring-red-500/10' : 'border-[var(--border-light)] focus:ring-4 focus:ring-emerald-500/10 text-[var(--text-primary)]'}`}
                              value={item.qtd_separada || 0}
                              onChange={(e) => updateItem(item.codigo, 'qtd_separada', Number(e.target.value))}
                            />
                          </td>
                          <td className="px-10 py-6">
                            <div className="flex justify-center gap-2">
                              <button
                                disabled={isOut}
                                onClick={() => updateItem(item.codigo, 'ok', !item.ok)}
                                className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${isOut ? 'opacity-20 cursor-not-allowed' : item.ok ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50'}`}
                                title="1. OK - Separado"
                              >
                                OK
                              </button>
                              <button
                                disabled={isOut}
                                onClick={() => updateItem(item.codigo, 'tr', !item.tr)}
                                className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${isOut ? 'opacity-20 cursor-not-allowed' : item.tr ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border border-gray-200 text-blue-600 hover:bg-blue-50'}`}
                                title="3. TR - Transferido"
                              >
                                TR
                              </button>
                              <button
                                onClick={() => {
                                  const newFalta = !item.falta;
                                  // When turning on OUT, clear other flags
                                  updateItem(item.codigo, 'falta', newFalta);
                                  if (newFalta) {
                                    updateItem(item.codigo, 'ok', false);
                                    updateItem(item.codigo, 'tr', false);
                                  }
                                }}
                                className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${item.falta ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white border border-gray-200 text-red-600 hover:bg-red-50'}`}
                                title="OUT - Falta/Divergência"
                              >
                                OUT
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                </tbody>
              </table>
            </div>

            <div className="p-8 bg-[var(--bg-inner)]/80 border-t-2 border-[var(--border-light)] flex justify-center">
              <div className="flex gap-4">
                <button
                  disabled={isFinalizing}
                  onClick={async () => {
                    if (!selectedOP) return;
                    setIsFinalizing(true);
                    try {
                      await supabase.from('separacao').update({
                        status: 'Pendente',
                        usuario_atual: null
                      }).eq('id', selectedOP.id);

                      // Artificial delay to ensure user perceives the save
                      await new Promise(resolve => setTimeout(resolve, 800));

                      setSelectedOP(null);
                      setViewMode('list');
                      setActiveTab('dashboard');
                    } catch (err) {
                      console.error('Erro ao salvar pendência:', err);
                      showAlert('Erro ao salvar. Tente novamente.', 'error');
                    } finally {
                      setIsFinalizing(false);
                    }
                  }}
                  className="flex-1 py-5 bg-[var(--bg-secondary)] border-2 border-[var(--border-light)] text-[var(--text-secondary)] rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-[var(--bg-inner)] active:scale-95 transition-all disabled:opacity-50"
                >
                  {isFinalizing ? '⏳ Salvando...' : 'Salvar como Pendência'}
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={isFinalizing}
                  className="flex-[1.5] py-5 bg-[#111827] text-white rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isFinalizing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Sincronizando...
                    </>
                  ) : (
                    'Finalizar Lote de Separação'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
          {ops.map((op, index) => {
            const styles = getUrgencyStyles(op.urgencia);
            const validItensForStats = op.rawItens.filter(i => {
              const b = blacklist.find(bl => bl.sku === i.codigo || (bl as any).codigo === i.codigo);
              return !b?.nao_sep;
            });
            const total = validItensForStats.length;
            const finalizedCount = validItensForStats.filter(i => {
              if (i.falta) return true;
              const isLupaDone = i.composicao?.every((c: any) => c.concluido);
              return i.ok && isLupaDone && i.tr;
            }).length;

            const progress = total > 0 ? Math.round((finalizedCount / total) * 100) : 0;
            const opRange = getOPDisplayRange(op.ordens);

            const isEmUso = op.usuarioAtual && op.usuarioAtual !== user.nome;
            const borderClass = isEmUso ? 'border-blue-500' :
              op.status === 'Pendente' ? 'border-amber-500' : 'border-[var(--border-light)]';

            return (
              <div key={op.id} className={`bg-[var(--bg-secondary)] rounded-[2rem] border-2 shadow-[var(--shadow-sm)] p-8 space-y-6 flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${isEmUso ? 'bg-[var(--bg-inner)]/50' : ''} ${borderClass}`}>
                {/* In-Use Bar */}
                {isEmUso && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-30"></div>
                )}

                {/* Top Row: ID, Priority, X */}
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">ID {(index + 1).toString().padStart(2, '0')}</span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${styles.bg} ${styles.text} opacity-80`}>
                      {op.urgencia.toUpperCase()}
                    </span>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir Lote: ${op.opCode}?`)) {
                          const performDelete = async () => {
                            // Delete from separacao
                            await supabase.from('separacao').delete().eq('id', op.id);

                            // Cascading delete: Remove TEA records related to these OPs
                            if (op.ordens && op.ordens.length > 0) {
                              await supabase.from('historico')
                                .delete()
                                .eq('armazem', 'TEA')
                                .in('documento', op.ordens);
                            }
                            fetchOps();
                          };
                          performDelete();
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-[var(--bg-inner)] text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="space-y-2 relative z-10 flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none">
                      📦 OP - {opRange}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOpForList(op);
                        setShowOpListModal(true);
                      }}
                      className="w-8 h-8 rounded-lg bg-[var(--bg-inner)] flex items-center justify-center text-xs hover:bg-blue-500/10 hover:text-blue-500 transition-all"
                      title="Ver lista completa de OPs"
                    >
                      🔍
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-[var(--border-light)] pt-4">
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">📍 Armazém</p>
                    <p className="text-[10px] font-black text-[var(--text-primary)] truncate">{op.armazem}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">👤 Resp.</p>
                    <p className={`text-[10px] font-black truncate ${op.usuarioAtual ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>
                      {op.usuarioAtual || 'Aguardando'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">📋 Itens</p>
                    <p className="text-[10px] font-black text-[var(--text-primary)]">{finalizedCount}/{total}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">📈 Progresso</p>
                    <p className={`text-[10px] font-black ${progress === 100 ? 'text-emerald-600' : 'text-[var(--text-primary)]'}`}>{progress}%</p>
                  </div>
                </div>

                {/* Progress Visual Mini */}
                <div className="w-full h-1 bg-gray-50 rounded-full overflow-hidden mt-2">
                  <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-[var(--text-primary)]'}`} style={{ width: `${progress}%` }}></div>
                </div>

                {/* Footer and Button */}
                <div className="space-y-4 pt-4 relative z-10">
                  <div className="flex justify-between items-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                    <span className={op.status === 'Pendente' ? 'text-amber-500' : 'text-[var(--text-muted)]'}>{op.status || 'PENDENTE'}</span>
                    <span>{new Date(op.data).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => handleStart(op)}
                    disabled={isEmUso}
                    className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 ${isEmUso
                      ? 'bg-[var(--bg-inner)] text-[var(--text-muted)] cursor-not-allowed shadow-none'
                      : progress === 100 ? 'bg-emerald-600 text-white shadow-emerald-500/10' : 'bg-[var(--text-primary)] text-[var(--bg-secondary)] hover:opacity-90 shadow-black/5'
                      }`}
                  >
                    {isEmUso ? 'Em Uso' : progress === 100 ? 'Concluído' : 'Abrir Seleção'}
                  </button>
                </div>
              </div>
            );
          })}
        </div >
      )
      }

      {/* Modals */}
      {
        showLupaModal && lupaItem && (
          <div className="fixed inset-0 z-[100] flex justify-end animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowLupaModal(false); setLupaItem(null); }}></div>
            <div className="relative bg-[var(--bg-secondary)] w-full max-w-md h-full shadow-2xl border-l border-[var(--border-light)] flex flex-col animate-slideInRight">
              <div className="p-8 bg-[var(--bg-inner)]/50 border-b border-[var(--border-light)] flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 text-emerald-600">Distribuição de Lote</h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{lupaItem.codigo}</p>
                </div>
                <button onClick={() => { setShowLupaModal(false); setLupaItem(null); }} className="w-10 h-10 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-all font-bold">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none">Status de Conferência</p>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded">Check Automático</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[var(--bg-inner)]/50 rounded-2xl border border-[var(--border-light)]">
                      <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Solicitado</p>
                      <p className="text-base font-black text-[var(--text-primary)]">{lupaItem.quantidade}</p>
                    </div>
                    <div className="p-4 bg-[var(--bg-inner)]/50 rounded-2xl border border-[var(--border-light)]">
                      <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Separado</p>
                      <p className="text-base font-black text-emerald-600">
                        {lupaItem.composicao?.reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                    Listagem por Ordem de Produção
                  </p>
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl overflow-hidden shadow-[var(--shadow-sm)]">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[var(--bg-inner)]/80 border-b border-[var(--border-light)]">
                        <tr className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest text-center">
                          <th className="px-4 py-3 text-left">OP</th>
                          <th className="px-3 py-3">QTD SOL.</th>
                          <th className="px-3 py-3">QTD SEP.</th>
                          <th className="px-3 py-3">AÇÃO</th>
                          <th className="px-3 py-3">OBS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-light)]">
                        {(lupaItem.composicao || []).map((comp: any, cidx: number) => {
                          const requested = comp.quantidade_original || comp.quantidade || 0;
                          return (
                            <tr key={cidx} className="hover:bg-[var(--bg-inner)]/50 transition-colors">
                              <td className="px-4 py-4">
                                <span className={`text-[11px] font-black uppercase tracking-tight ${comp.concluido ? 'text-emerald-600' : 'text-[var(--text-primary)]'}`}>{comp.op}</span>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <span className="text-[11px] font-bold text-[var(--text-muted)]">{requested}</span>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <input
                                  type="number"
                                  className="w-14 px-1 py-1 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-lg text-center font-black text-xs focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all text-[var(--text-primary)]"
                                  value={comp.qtd_separada || 0}
                                  onChange={(e) => updateLupaQuantity(lupaItem.codigo, comp.op, Number(e.target.value))}
                                />
                              </td>
                              <td className="px-3 py-4 text-center">
                                <button
                                  onClick={() => updateLupaStatus(lupaItem.codigo, comp.op, !comp.concluido)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all shadow-sm ${comp.concluido ? 'bg-emerald-600 text-white shadow-emerald-500/10' : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] text-emerald-600 hover:bg-emerald-500/10'}`}
                                >
                                  OK
                                </button>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <button
                                  onClick={() => { setObsItem({ ...lupaItem, currentOp: comp.op }); setShowObsModal(true); }}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${comp.observacao ? 'bg-blue-500/10 text-blue-500 border border-blue-200 shadow-sm' : 'bg-[var(--bg-inner)] text-[var(--text-muted)] hover:bg-blue-500/10 hover:text-blue-500 opacity-60 hover:opacity-100'}`}
                                  title="Anotações / Observações"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              <div className="p-8 bg-[var(--bg-inner)]/50 border-t border-[var(--border-light)]">
                <button
                  onClick={() => { setShowLupaModal(false); setLupaItem(null); }}
                  className={`w-full py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all ${lupaItem.composicao?.every((c: any) => c.concluido) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-[var(--text-primary)] text-[var(--bg-secondary)] hover:opacity-90'}`}
                >
                  Fechar Distribuição
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        showObsModal && obsItem && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowObsModal(false); setObsItem(null); }}></div>
            <div className="relative bg-[var(--bg-secondary)] w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
              <div className="flex justify-between items-center border-b border-[var(--border-light)] pb-6">
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1">Notas da Separação</h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{obsItem.codigo}</p>
                </div>
                <button onClick={() => { setShowObsModal(false); setObsItem(null); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">✕</button>
              </div>
              <div className="space-y-6">
                <div className="p-4 bg-[var(--bg-inner)]/50 rounded-2xl border border-[var(--border-light)] italic text-[10px] font-bold text-[var(--text-muted)]">
                  Editando observação da OP: {obsItem.currentOp}
                </div>
                <textarea
                  className="w-full h-40 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-2xl p-6 text-sm font-bold text-[var(--text-primary)] outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                  placeholder="Escreva sua observação aqui..."
                  defaultValue={(obsItem.composicao || []).find((c: any) => c.op === obsItem.currentOp)?.observacao || ''}
                  onBlur={(e) => handleSaveObs(obsItem.codigo, obsItem.currentOp, e.target.value)}
                />
                <button onClick={() => setShowObsModal(false)} className="w-full py-5 bg-[var(--text-primary)] text-[var(--bg-secondary)] rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:opacity-90 transition-all">Salvar e Fechar</button>
              </div>
            </div>
          </div>
        )
      }

      {
        showOpListModal && selectedOpForList && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowOpListModal(false)}></div>
            <div className="relative bg-[var(--bg-secondary)] w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp overflow-hidden">
              <div className="flex justify-between items-center border-b border-[var(--border-light)] pb-6">
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 italic">Relação de OPs</h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate">{selectedOpForList.opCode}</p>
                </div>
                <button onClick={() => setShowOpListModal(false)} className="w-10 h-10 bg-[var(--bg-inner)] rounded-xl flex items-center justify-center text-xs font-black text-[var(--text-muted)] hover:bg-[var(--bg-inner)]/80 hover:text-[var(--text-primary)] transition-all">✕</button>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                <div
                  onClick={() => { setSelectedOpForList(null); setShowOpListModal(false); }}
                  className="flex justify-between items-center p-4 bg-[var(--bg-inner)]/50 border border-[var(--border-light)] rounded-2xl cursor-pointer hover:bg-emerald-500/10 transition-colors group"
                >
                  <span className="text-xs font-black text-emerald-600">📦 Todas OPs</span>
                  <span className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg text-[8px] font-black text-emerald-600 uppercase">Selecionado</span>
                </div>
                {selectedOpForList.ordens.map((opCode: string, i: number) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-[var(--bg-inner)]/50 border border-[var(--border-light)] rounded-2xl hover:bg-emerald-500/10 transition-colors group cursor-pointer">
                    <span className="text-xs font-black text-[var(--text-secondary)] group-hover:text-emerald-700">OP {opCode.replace(/^00/, '').replace(/01001$/, '')}</span>
                    <span className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg text-[8px] font-black text-[var(--text-muted)] uppercase">Pendente</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowOpListModal(false)} className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg-secondary)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all">Fechar Lista</button>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Separacao;
