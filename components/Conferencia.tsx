import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import Loading from './Loading';

const Conferencia: React.FC<{ user: User, blacklist: any[] }> = ({ user, blacklist }) => {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [searchText, setSearchText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const [showTransferList, setShowTransferList] = useState(false);
  const [selectedOpForDetail, setSelectedOpForDetail] = useState<string | null>(null);
  const [showObsModal, setShowObsModal] = useState(false);
  const [obsItem, setObsItem] = useState<any | null>(null);
  const [manualConferente, setManualConferente] = useState(user.nome);

  const [showDivModal, setShowDivModal] = useState(false);
  const [divItem, setDivItem] = useState<any | null>(null);
  const [divReason, setDivReason] = useState('');

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('conferencia').select('*').order('id', { ascending: false });
    if (error) console.error(error);
    else setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchItems();
    const channel = supabase.channel('conferencia-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferencia' }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleStart = async (item: any) => {
    if (item.responsavel_conferencia && item.responsavel_conferencia !== user.nome) {
      alert(`⚠️ Bloqueio: Em uso por "${item.responsavel_conferencia}"`);
      return;
    }
    const sortedItens = [...(item.itens || [])].sort((a, b) => a.codigo.localeCompare(b.codigo));
    await supabase.from('conferencia').update({ responsavel_conferencia: user.nome, status: 'Em Conferência' }).eq('id', item.id);
    setSelectedItem({ ...item, itens: sortedItens, responsavel_conferencia: user.nome, status: 'Em Conferência' });
    setViewMode('detail');
    setManualConferente(user.nome);
  };

  const handleBack = async () => {
    if (selectedItem) {
      await supabase.from('conferencia').update({ responsavel_conferencia: null }).eq('id', selectedItem.id);
    }
    setViewMode('list');
    setSelectedItem(null);
  };

  const updateItemConf = async (itemCodigo: string, field: string, value: any) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((i: any) => i.codigo === itemCodigo ? { ...i, [field]: value } : i);
    setIsSaving(true);
    const { error } = await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    if (!error) setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleToggleIndivComp = async (itemCodigo: string, op: string, field: 'ok_conf' | 'ok2_conf', value: boolean) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((item: any) => {
      if (item.codigo === itemCodigo) {
        const newComp = (item.composicao || []).map((c: any) => c.op === op ? { ...c, [field]: value } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });
    setIsSaving(true);
    const { error } = await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    if (!error) setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleToggleGroupTR = async (opCode: string, value: boolean) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((item: any) => {
      const hasOp = item.composicao?.some((c: any) => c.op === opCode);
      if (hasOp) {
        const newComp = item.composicao.map((c: any) => c.op === opCode ? { ...c, tr_conf: value } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });
    setIsSaving(true);
    await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleSaveObs = async (sku: string, op: string, text: string) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((item: any) => {
      if (item.codigo === sku) {
        const newComp = (item.composicao || []).map((c: any) => c.op === op ? { ...c, obs_conf: text } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });
    setIsSaving(true);
    await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleDivergencia = (item: any) => {
    setDivItem(item);
    setDivReason(item.div_conferencia || '');
    setShowDivModal(true);
  };

  const handleConfirmDivergencia = async () => {
    if (!divItem) return;
    updateItemConf(divItem.codigo, 'div_conferencia', divReason);
    setShowDivModal(false);
    setDivItem(null);
  };

  const handleToggleGroup = async (opCode: string, field: 'ok_conf' | 'ok2_conf', value: boolean) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((item: any) => {
      const hasOp = item.composicao?.some((c: any) => c.op === opCode);
      if (hasOp) {
        const newComp = item.composicao.map((c: any) => c.op === opCode ? { ...c, [field]: value } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });
    setIsSaving(true);
    await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleSavePendency = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      await supabase.from('conferencia').update({ status: 'Aguardando', responsavel_conferencia: null }).eq('id', selectedItem.id);
      alert('Conferência salva como Pendente.');
      setViewMode('list');
      setSelectedItem(null);
    } catch (err) {
      console.error(err);
    } finally { setIsSaving(false); }
  };

  const handleRevert = async () => {
    if (!selectedItem) return;
    if (!confirm('Reverter Lote para Separação?')) return;
    setIsReverting(true);
    try {
      const separationData = {
        documento: selectedItem.nome || selectedItem.documento,
        armazem: selectedItem.armazem,
        ordens: selectedItem.ordens,
        itens: selectedItem.itens.map((i: any) => ({ ...i, quantidade: i.original_solicitado || i.quantidade })),
        status: 'Pendente'
      };
      await supabase.from('conferencia').delete().eq('id', selectedItem.id);
      await supabase.from('separacao').insert([separationData]);
      alert('Lote revertido para Separação com sucesso!');
      setViewMode('list'); setSelectedItem(null);
    } catch (e) {
      console.error(e);
      alert('Erro ao reverter');
    } finally { setIsReverting(false); }
  };

  const getOPDisplayRange = (ordens: string[]) => {
    if (!ordens || ordens.length === 0) return 'S/N';
    const formatted = ordens.map(op => {
      const match = op.match(/00(\d{4})01001/);
      return match ? match[1] : op.slice(-6);
    });
    const unique = Array.from(new Set(formatted)).sort();
    return unique.length > 1 ? `${unique[0]} - ${unique[unique.length - 1]}` : unique[0];
  };

  const handleFinalize = async () => {
    if (!selectedItem) return;
    const isComplete = selectedItem.itens.every((item: any) => {
      const blacklistItem = blacklist.find(b => b.sku === item.codigo);
      if (blacklistItem?.nao_sep) return true;
      return (item.composicao || []).every((c: any) => c.ok_conf && c.ok2_conf);
    });
    if (!isComplete && !confirm('Alguns itens não foram conferidos. Finalizar assim mesmo?')) return;

    setIsLoading(true);
    try {
      const docTransf = selectedItem.itens[0]?.doc_transferencia || selectedItem.documento;
      const historyDocId = docTransf.startsWith('DOC-') ? docTransf : `DOC-${docTransf}`;
      const currentConferente = manualConferente || user.nome;

      const batchHistoryData = {
        documento: historyDocId,
        nome: selectedItem.nome || selectedItem.documento,
        armazem: selectedItem.armazem,
        itens: selectedItem.itens.map((item: any, idx: number) => ({
          ...item,
          metadata: idx === 0 ? {
            conferente: currentConferente,
            separador: item.usuario_atual || 'N/A',
            data_finalizacao: new Date().toISOString(),
            total_itens: selectedItem.itens.length,
            op_range: getOPDisplayRange(selectedItem.ordens),
            ordens: selectedItem.ordens
          } : undefined
        }))
      };

      try {
        const { data: existingRecord } = await supabase.from('historico').select('id').eq('documento', historyDocId).maybeSingle();
        if (existingRecord) {
          await supabase.from('historico').update(batchHistoryData).eq('id', existingRecord.id);
        } else {
          await supabase.from('historico').insert([batchHistoryData]);
        }
      } catch (err) {
        console.error('Erro no arquivamento:', err);
        await supabase.from('historico').insert([batchHistoryData]);
      }

      const uniqueOps = [...new Set(selectedItem.itens.flatMap((i: any) => i.composicao?.map((c: any) => c.op) || []))];
      for (const opCode of uniqueOps) {
        if (!opCode) continue;
        const { data: histData } = await supabase.from('historico').select('*').eq('documento', opCode).maybeSingle();
        if (histData) {
          const newFluxo = [...(histData.itens || []), {
            status: 'Qualidade', icon: '🔍', data: new Date().toLocaleDateString('pt-BR'), conferente: currentConferente, lote_conferencia: historyDocId
          }];
          await supabase.from('historico').update({ itens: newFluxo }).eq('id', histData.id);
        }
      }
      await supabase.from('conferencia').delete().eq('id', selectedItem.id);
      alert('Conferência finalizada!');
      setViewMode('list'); setSelectedItem(null);
    } catch (e) {
      console.error(e);
      alert('Erro ao finalizar');
    } finally { setIsLoading(true); fetchItems(); }
  };

  if (isLoading && items.length === 0) return <Loading message="Sincronizando Conferência..." />;

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-blue-600 shadow-sm">
        <h1 className="text-sm font-black text-blue-600 uppercase tracking-widest">Conferência</h1>
        <div className="relative w-full md:w-96 group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none transition-colors group-focus-within:text-blue-500">🔍</span>
          <input
            type="text"
            placeholder="BUSCAR POR OP, DOC OU ARMAZÉM..."
            className="w-full bg-gray-50 border-none rounded-2xl py-3 pl-12 pr-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/20 transition-all"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {viewMode === 'detail' && selectedItem ? (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 p-8 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-6">
                <button onClick={handleBack} className="w-12 h-12 bg-white border border-gray-200 rounded-2xl flex items-center justify-center text-lg hover:bg-gray-50 transition-all">←</button>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-black">🔍</div>
                  <h2 className="text-2xl font-black tracking-tight uppercase">{selectedItem.nome || selectedItem.documento}</h2>
                </div>
                <button
                  disabled={isReverting}
                  onClick={handleRevert}
                  className="px-6 py-2 bg-white border-2 border-orange-50 text-orange-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-orange-100 transition-all"
                >
                  {isReverting ? 'Revertendo...' : '↩️ Voltar Situação'}
                </button>
              </div>
              <div className="flex gap-4 items-center">
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Documento</p>
                  <p className="text-xs font-black text-gray-900">{selectedItem.itens[0]?.doc_transferencia || 'N/A'}</p>
                </div>
                <div className="text-right bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Responsável</p>
                  <input
                    type="text"
                    value={manualConferente}
                    onChange={(e) => setManualConferente(e.target.value.toUpperCase())}
                    className="text-xs font-black text-blue-600 text-right bg-transparent border-none p-0 focus:ring-0 uppercase w-32"
                  />
                </div>
              </div>
            </div>

            <div className="p-10 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase tracking-tight">
                  <span>📋</span> Ordens de Produção - Status
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(selectedItem.itens.flatMap((i: any) => (i.composicao || []).map((c: any) => c.op)))].map(opCode => {
                    const opItensComps = selectedItem.itens.flatMap((i: any) => (i.composicao || []).filter((c: any) => c.op === opCode));
                    const isDone = opItensComps.length > 0 && opItensComps.every((c: any) => c.ok_conf && c.ok2_conf);
                    const isSelected = selectedOpForDetail === opCode;
                    return (
                      <button
                        key={opCode}
                        onClick={() => setSelectedOpForDetail(isSelected ? null : (opCode as any))}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all border ${isSelected ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                      >
                        <span>{isDone ? '✅' : '⏳'}</span> OP {opCode}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {selectedItem.itens
                  .filter((item: any) => !selectedOpForDetail || item.composicao?.some((c: any) => c.op === selectedOpForDetail))
                  .map((item: any, idx: number) => {
                    const isOk = (item.composicao || []).every((c: any) => c.ok_conf && c.ok2_conf);
                    return (
                      <div key={idx} className={`p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 hover:shadow-md transition-all ${isOk ? 'border-l-4 border-l-emerald-500' : ''}`}>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">📦</span>
                            <p className="font-black text-gray-900 text-lg font-mono tracking-tighter">{item.codigo}</p>
                            <button
                              onClick={() => { setObsItem(item); setShowObsModal(true); }}
                              className={`text-xs hover:scale-125 transition-transform ${item.composicao?.some((c: any) => c.obs_conf) ? 'text-blue-500' : 'text-gray-300'}`}
                            >🗨️</button>
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{item.descricao}</p>
                        </div>

                        <div className="flex-1 w-full max-w-2xl bg-gray-50/50 p-4 rounded-2xl space-y-3">
                          {(item.composicao || [])
                            .filter((c: any) => !selectedOpForDetail || c.op === selectedOpForDetail)
                            .map((comp: any, cidx: number) => (
                              <div key={cidx} className="flex flex-col md:flex-row items-center justify-between gap-4 p-3 bg-white rounded-xl border border-gray-50 group hover:border-blue-200 transition-all">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center text-[8px] font-black">{comp.op.slice(-4)}</div>
                                  <p className="text-[10px] font-black text-gray-400 font-mono italic">{comp.op}</p>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="text-center">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Qtd</p>
                                    <p className="text-sm font-black text-gray-900">{comp.qtd_separada}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleToggleIndivComp(item.codigo, comp.op, 'ok_conf', !comp.ok_conf)}
                                      className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center border ${comp.ok_conf ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white text-gray-400 border-gray-200 hover:bg-emerald-50'}`}
                                    >C1</button>
                                    <button
                                      onClick={() => handleToggleIndivComp(item.codigo, comp.op, 'ok2_conf', !comp.ok2_conf)}
                                      className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center border ${comp.ok2_conf ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white text-gray-400 border-gray-200 hover:bg-emerald-50'}`}
                                    >C2</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                        <button onClick={() => handleDivergencia(item)} className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm transition-all border ${item.div_conferencia ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-200 border-gray-100 hover:bg-orange-50 hover:text-orange-500'}`}>⚠️</button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="p-10 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-4 text-xs font-black text-gray-400 uppercase tracking-widest">
                <p>Itens {selectedItem.itens.length}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={handleSavePendency} disabled={isSaving} className="px-8 py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-3xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-gray-50 transition-all">Salvar Pendência</button>
                <button onClick={handleFinalize} disabled={isSaving || isReverting} className="px-10 py-4 bg-blue-600 text-white rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-blue-700 transition-all">Finalizar Conferência</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, index) => {
            const isEmUso = item.responsavel_conferencia && item.responsavel_conferencia !== user.nome;
            const borderClass = isEmUso || item.status === 'Em Conferência' ? 'border-blue-500' : 'border-gray-100';

            return (
              <div key={item.id} className={`bg-white rounded-3xl border-2 ${borderClass} shadow-sm p-8 space-y-6 flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${isEmUso ? 'bg-gray-50' : ''}`}>
                {/* In-Use Bar */}
                {isEmUso && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-30"></div>
                )}

                {/* Top Row: ID, Status, X */}
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">ID {(index + 1).toString().padStart(2, '0')}</span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${item.status === 'Em Conferência' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'
                      }`}>
                      {item.status || 'AGUARDANDO'}
                    </span>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir Lote: ${item.documento}?`)) {
                          await supabase.from('conferencia').delete().eq('id', item.id);
                          fetchItems();
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* OP Section */}
                <div className="space-y-4 relative z-10">
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Lote: {item.nome || item.documento}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">📍 Armazém</p>
                      <p className="text-xs font-black text-gray-900 truncate">{item.armazem}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">📋 Itens</p>
                      <p className="text-xs font-black text-gray-900">{item.itens?.length || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Footer and Button */}
                <div className="space-y-4 pt-4 relative z-10 border-t border-gray-50">
                  <button
                    onClick={() => handleStart(item)}
                    disabled={isEmUso}
                    className={`w-full py-4 rounded-[1.25rem] text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${isEmUso
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed shadow-none'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
                      }`}
                  >
                    {isEmUso ? 'Em Uso' : 'Conferir Lote'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showDivModal && divItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDivModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
            <h3 className="text-xl font-black text-gray-900 uppercase">Divergência / Falta</h3>
            <textarea
              className="w-full h-32 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-bold text-gray-800 outline-none focus:ring-4 focus:ring-orange-50 transition-all resize-none"
              placeholder="Descreva o motivo da divergência..."
              value={divReason}
              onChange={(e) => setDivReason(e.target.value)}
            />
            <button onClick={handleConfirmDivergencia} className="w-full py-5 bg-orange-500 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-orange-600 transition-all">Salvar Divergência</button>
          </div>
        </div>
      )}

      {showObsModal && obsItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowObsModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
            <h3 className="text-xl font-black text-gray-900 uppercase">Observações</h3>
            <div className="max-h-96 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {(obsItem.composicao || []).map((comp: any, i: number) => (
                <div key={i} className="space-y-3 p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase">OP: {comp.op}</p>
                  <textarea
                    className="w-full h-24 bg-white border border-gray-100 rounded-2xl p-4 text-xs font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                    placeholder="Observação da conferência..."
                    defaultValue={comp.obs_conf || ''}
                    onBlur={(e) => handleSaveObs(obsItem.codigo, comp.op, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <button onClick={() => setShowObsModal(false)} className="w-full py-5 bg-gray-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all">Confirmar e Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conferencia;
