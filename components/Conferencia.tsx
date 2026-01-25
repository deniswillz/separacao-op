import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import Loading from './Loading';
import { useAlert } from './AlertContext';


const Conferencia: React.FC<{ user: User, blacklist: any[], setActiveTab: (tab: string) => void }> = ({ user, blacklist, setActiveTab }) => {
  const { showAlert } = useAlert();
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

  const getOPDisplayRange = (ordens: string[]) => {
    if (!ordens || ordens.length === 0) return 'S/N';
    const formatted = ordens.map(op => {
      // Logic: remove 00 at start and 01001 at end
      return op.replace(/^00/, '').replace(/01001$/, '');
    });
    const unique = Array.from(new Set(formatted)).sort();
    return unique.length > 1 ? `${unique[0]} - ${unique[unique.length - 1]}` : unique[0];
  };

  const handleStart = async (item: any) => {
    if (item.responsavel_conferencia && item.responsavel_conferencia !== user.nome) {
      showAlert(`Bloqueio: Em uso por "${item.responsavel_conferencia}"`, 'warning');
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
    setActiveTab('dashboard');
  };

  const updateItemConf = async (itemCodigo: string, field: string, value: any) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((i: any) => i.codigo === itemCodigo ? { ...i, [field]: value } : i);
    setIsSaving(true);
    const { error } = await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    if (!error) setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleToggleIndivComp = async (itemCodigo: string, op: string, field: 'ok_conf' | 'ok2_conf' | 'tr_conf', value: boolean) => {
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

  const handleSaveObs = async (sku: string, op: string, text: string) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map((item: any) => {
      if (item.codigo === sku) {
        const newComp = (item.composicao || []).map((c: any) => c.op === op ? { ...c, observacao: text } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });
    setIsSaving(true);
    await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleDivergencia = (item: any, comp: any) => {
    setDivItem({ ...item, currentOp: comp.op });
    setDivReason(comp.motivo_divergencia || '');
    setShowDivModal(true);
  };

  const handleConfirmDivergencia = async () => {
    if (!divItem || !selectedItem) return;

    // Alert logic for Dashboard
    if (divReason.trim().length > 0) {
      window.dispatchEvent(new CustomEvent('falta-detectada', {
        detail: {
          op: divItem.currentOp,
          produto: divItem.codigo,
          motivo: `Divergência na Conferência: ${divReason}`
        }
      }));
    }

    const newItens = selectedItem.itens.map((item: any) => {
      if (item.codigo === divItem.codigo) {
        const newComp = (item.composicao || []).map((c: any) =>
          c.op === divItem.currentOp ? { ...c, falta_conf: !!divReason.trim(), motivo_divergencia: divReason } : c
        );
        return { ...item, composicao: newComp };
      }
      return item;
    });

    setIsSaving(true);
    await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    setIsSaving(false);
    setSelectedItem({ ...selectedItem, itens: newItens });
    setShowDivModal(false);
    setDivItem(null);
  };

  const handleFinalize = async () => {
    if (!selectedItem) return;

    const isComplete = selectedItem.itens.every((item: any) => {
      // Skip items that were not marked as OK in separation (e.g. OUT items)
      if (item.ok !== true && item.ok !== 'true') return true;

      const blacklistItem = blacklist.find(b => b.sku === item.codigo);
      if (blacklistItem?.nao_sep) return true;

      // Ensure all composition items are checked
      return (item.composicao || []).every((c: any) => c.ok_conf && c.tr_conf);
    });

    if (!isComplete) {
      showAlert('Bloqueio: Todos os itens conferidos devem estar em check (OK e TR) para finalizar.', 'warning');
      return;
    }

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

      const { data: existingRecord } = await supabase.from('historico').select('id').eq('documento', historyDocId).maybeSingle();

      // Calculate total separated quantity
      const totalSeparatedSum = selectedItem.itens.reduce((acc: number, item: any) => acc + (item.quantidade || 0), 0);

      if (existingRecord) {
        await supabase.from('historico').update({ ...batchHistoryData, total_itens: totalSeparatedSum }).eq('id', existingRecord.id);
      } else {
        await supabase.from('historico').insert([{ ...batchHistoryData, total_itens: totalSeparatedSum }]);
      }

      await supabase.from('conferencia').delete().eq('id', selectedItem.id);
      showAlert('Conferência finalizada!', 'success');
      setViewMode('list'); setSelectedItem(null);
      setActiveTab('historico');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao finalizar', 'error');
    } finally { setIsLoading(false); fetchItems(); }
  };

  const handleSavePendency = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      await supabase.from('conferencia').update({ status: 'Aguardando', responsavel_conferencia: null }).eq('id', selectedItem.id);
      showAlert('Conferência salva como Pendente.', 'info');
      setViewMode('list');
      setSelectedItem(null);
      setActiveTab('dashboard');
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
        itens: selectedItem.itens.map((i: any) => ({
          ...i,
          quantidade: i.original_solicitado || i.quantidade,
          ok: false,
          tr: false,
          composicao: (i.composicao || []).map((c: any) => ({ ...c, concluido: false, ok_conf: false, tr_conf: false }))
        })),
        status: 'Pendente'
      };
      await supabase.from('conferencia').delete().eq('id', selectedItem.id);
      await supabase.from('separacao').insert([separationData]);
      showAlert('Lote revertido para Separação com sucesso!', 'success');
      setViewMode('list'); setSelectedItem(null);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao reverter', 'error');
    } finally { setIsReverting(false); }
  };

  if (isLoading && items.length === 0) return <Loading message="Sincronizando Conferência..." />;

  // Calculate stats for Detail View
  const totalSeparado = selectedItem?.itens.reduce((acc: number, item: any) => acc + (item.quantidade || 0), 0) || 0;
  const totalConferidoQtd = selectedItem?.itens.reduce((acc: number, item: any) => {
    return acc + (item.composicao || []).reduce((cAcc: number, c: any) => c.ok_conf ? cAcc + (c.qtd_separada || 0) : cAcc, 0);
  }, 0) || 0;

  const progressoGeral = totalSeparado > 0 ? Math.round((totalConferidoQtd / totalSeparado) * 100) : 0;
  const totalOkItemsCount = selectedItem?.itens.filter((i: any) => i.ok === true || i.ok === 'true').length || 0;
  const itensCompletosCount = selectedItem?.itens.filter((i: any) => (i.ok === true || i.ok === 'true') && (i.composicao || []).every((c: any) => c.ok_conf)).length || 0;
  const divergenciasCount = selectedItem?.itens.filter((i: any) => i.div_conferencia).length || 0;

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
          {/* Header Resumo */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 p-8 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start gap-8">
              <div className="flex items-center gap-6">
                <button onClick={handleBack} className="w-12 h-12 bg-white border border-gray-200 rounded-2xl flex items-center justify-center text-lg hover:bg-gray-50 transition-all shadow-sm">←</button>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Conferindo Lote</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase">LIVE</span>
                  </div>
                  <h2 className="text-2xl font-black tracking-tighter uppercase">{selectedItem.itens[0]?.doc_transferencia || selectedItem.documento}</h2>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6 w-full md:w-auto">
                <div className="space-y-1 bg-white p-4 rounded-2xl border border-gray-50 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-2">👤 Responsável</p>
                  <input
                    type="text"
                    value={manualConferente}
                    onChange={(e) => setManualConferente(e.target.value.toUpperCase())}
                    className="text-[11px] font-black text-blue-600 bg-transparent border-none p-0 focus:ring-0 uppercase w-full"
                  />
                </div>
                <div className="space-y-1 bg-gray-900 p-4 rounded-2xl shadow-xl text-white">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-2">📈 Progresso Geral</p>
                  <div className="flex items-end gap-2">
                    <p className="text-xl font-black italic">{progressoGeral}%</p>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full mb-1.5 overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progressoGeral}%` }}></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 bg-white p-4 rounded-2xl border border-gray-50 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-2">✅ Itens OK</p>
                  <p className="text-xl font-black text-gray-900">{itensCompletosCount}<span className="text-xs text-gray-300 ml-1">/ {selectedItem.itens.length}</span></p>
                </div>
                <div className="space-y-1 bg-white p-4 rounded-2xl border border-gray-50 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-2">🚨 Divergências</p>
                  <p className={`text-xl font-black ${divergenciasCount > 0 ? 'text-red-500' : 'text-gray-900'}`}>{divergenciasCount}</p>
                </div>
              </div>
            </div>

            {/* Abas e Filtros */}
            <div className="px-10 py-6 border-b border-gray-50 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTransferList(false)}
                  className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!showTransferList ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                >Lista de Itens</button>
                <button
                  onClick={() => setShowTransferList(true)}
                  className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showTransferList ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                >Lista de Transferência</button>
              </div>

              {showTransferList && (
                <button
                  onClick={() => {
                    const allOk = selectedItem.itens.every((i: any) => (i.composicao || []).every((c: any) => c.tr_conf));
                    const newItens = selectedItem.itens.map((i: any) => ({
                      ...i,
                      composicao: (i.composicao || []).map((c: any) => ({ ...c, tr_conf: !allOk }))
                    }));
                    setSelectedItem({ ...selectedItem, itens: newItens });
                    supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
                  }}
                  className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all"
                >Marcar Todos TR</button>
              )}

              {!showTransferList && (
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scroll-hide">
                  <button
                    onClick={() => setSelectedOpForDetail(null)}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${!selectedOpForDetail ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                  >Todas OPs</button>
                  {[...new Set(selectedItem.itens.flatMap((i: any) => (i.composicao || []).map((c: any) => c.op)))].map((opCode: any) => (
                    <button
                      key={opCode}
                      onClick={() => setSelectedOpForDetail(selectedOpForDetail === opCode ? null : (opCode as string))}
                      className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${selectedOpForDetail === opCode ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
                    >OP {(opCode as string).replace(/^00/, '').replace(/01001$/, '')}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="p-0 overflow-y-auto max-h-[60vh] custom-scrollbar">
              {!showTransferList ? (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white z-20 border-b border-gray-100">
                    <tr className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-8 py-4">OBS 🗨️</th>
                      <th className="px-6 py-4">PRODUTO / OP</th>
                      <th className="px-6 py-4 text-center">SOLICITADO</th>
                      <th className="px-6 py-4 text-center">SEPARADO</th>
                      <th className="px-8 py-4 text-right">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItem.itens
                      .filter((item: any) => !selectedOpForDetail || item.composicao?.some((c: any) => c.op === selectedOpForDetail))
                      .map((item: any, idx: number) => {
                        const comps = (item.composicao || []).filter((c: any) => {
                          const matchOp = !selectedOpForDetail || c.op === selectedOpForDetail;
                          return matchOp && (item.ok === true || item.ok === 'true');
                        });

                        const itemIsComplete = (item.ok === true || item.ok === 'true') && (item.composicao || []).every((c: any) => c.ok_conf && c.tr_conf);
                        const itemHasDivergence = (item.composicao || []).some((c: any) => c.falta_conf);

                        const rowClass = itemHasDivergence ? 'bg-red-50' :
                          itemIsComplete ? 'bg-emerald-50/80' :
                            '';

                        return comps.map((comp: any, cidx: number) => (
                          <tr key={`${idx}-${cidx}`} className={`group ${rowClass} transition-all border-b border-gray-100 hover:bg-gray-50/30`}>
                            <td className={`px-8 py-4 border-l-4 ${itemHasDivergence ? 'border-red-500' : itemIsComplete ? 'border-emerald-500' : 'border-transparent'}`}>
                              <button
                                onClick={() => { setObsItem({ ...item, currentOp: comp.op }); setShowObsModal(true); }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${comp.observacao ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-200 group-hover:text-blue-200'}`}
                              >🗨️</button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-0.5">
                                <p className="text-xs font-black text-gray-900 tracking-tight">{item.codigo}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[200px]">{item.descricao}</p>
                                <p className="text-[8px] font-black text-blue-500 font-mono italic">OP {comp.op}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <p className="text-xs font-black text-gray-400 font-mono">{(comp.quantidade_original || comp.quantidade || comp.qtd_separada)}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <p className="text-sm font-black text-gray-900 font-mono">{comp.qtd_separada}</p>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  disabled={!!comp.falta_conf}
                                  onClick={() => handleToggleIndivComp(item.codigo, comp.op, 'ok_conf', !comp.ok_conf)}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] transition-all border ${comp.ok_conf ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:border-emerald-200 group-hover:bg-emerald-50'} ${comp.falta_conf ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >OK</button>
                                <button
                                  disabled={!!comp.falta_conf}
                                  onClick={() => handleToggleIndivComp(item.codigo, comp.op, 'tr_conf', !comp.tr_conf)}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] transition-all border ${comp.tr_conf ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200 group-hover:bg-blue-50'} ${comp.falta_conf ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >TR</button>
                                <button
                                  onClick={() => handleDivergencia(item, comp)}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm transition-all border ${comp.falta_conf ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-200 border-gray-100 hover:border-orange-200 group-hover:bg-orange-50'}`}
                                >⚠️</button>
                              </div>
                            </td>
                          </tr>
                        ));
                      })}
                  </tbody>
                </table>
              ) : (
                <div className="p-0 animate-fadeIn">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                        <th className="px-8 py-4">OK</th>
                        <th className="px-6 py-4">CÓDIGO</th>
                        <th className="px-6 py-4">DESCRIÇÃO</th>
                        <th className="px-6 py-4 text-center">QTD SOLIC.</th>
                        <th className="px-8 py-4 text-center">QTD SEPAR.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.values(
                        selectedItem.itens
                          .filter((i: any) => i.ok === true || i.ok === 'true')
                          .reduce((acc: any, curr: any) => {
                            if (!acc[curr.codigo]) {
                              acc[curr.codigo] = { ...curr, totalSolic: 0, totalSepar: 0, isOk: true };
                            }
                            acc[curr.codigo].totalSolic += (curr.composicao || []).reduce((a: number, c: any) => a + (c.quantidade_original || c.quantidade || c.qtd_separada), 0);
                            acc[curr.codigo].totalSepar += (curr.quantidade || 0);
                            acc[curr.codigo].isOk = acc[curr.codigo].isOk && (curr.composicao || []).every((c: any) => c.tr_conf);
                            return acc;
                          }, {})
                      ).map((row: any, ridx: number) => (
                        <tr key={ridx} className="hover:bg-gray-50/50 transition-all">
                          <td className="px-8 py-4">
                            <div className={`w-5 h-5 rounded flex items-center justify-center border ${row.isOk ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200'}`}>
                              {row.isOk && '✓'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-gray-900">{row.codigo}</td>
                          <td className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase truncate max-w-[300px]">{row.descricao}</td>
                          <td className="px-6 py-4 text-center text-xs font-black text-gray-400 font-mono">{row.totalSolic}</td>
                          <td className="px-8 py-4 text-center text-sm font-black text-gray-900 font-mono">{row.totalSepar}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Floating Actions Footer */}
            <div className="p-8 bg-gray-50/80 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-6">
                <div className="bg-white px-6 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                  <span className="text-xs font-black text-gray-300 uppercase">Resumo da Conferência</span>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400">✅ Itens OK:</span>
                      <span className="text-xs font-black text-blue-600 font-mono">{itensCompletosCount} / {totalOkItemsCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400">Verificados:</span>
                      <span className="text-xs font-black text-emerald-600 font-mono tracking-tighter">{totalConferidoQtd} / {totalSeparado} ⏳</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  disabled={isReverting}
                  onClick={handleRevert}
                  className="px-6 py-4 bg-white border-2 border-orange-50 text-orange-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:border-orange-200 transition-all"
                >{isReverting ? 'Revertendo...' : '↩️ Reverter p/ Separação'}</button>
                <button onClick={handleSavePendency} disabled={isSaving} className="px-8 py-4 bg-white border-2 border-gray-100 text-gray-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Salvar como Pendente</button>
                <button onClick={handleFinalize} disabled={isSaving || isReverting} className="px-10 py-4 bg-blue-600 text-white rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-blue-700 transition-all active:scale-95">Finalizar Lote</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.filter(item => {
            const search = searchText.toLowerCase();
            return item.nome?.toLowerCase().includes(search) || item.documento?.toLowerCase().includes(search) || item.armazem?.toLowerCase().includes(search);
          }).map((item, index) => {
            const isEmUso = item.responsavel_conferencia && item.responsavel_conferencia !== user.nome;
            const borderClass = isEmUso || item.status === 'Em Conferência' ? 'border-blue-500' : 'border-gray-100';
            const opDisplay = getOPDisplayRange(item.ordens || []);

            return (
              <div key={item.id} className={`bg-white rounded-3xl border-2 ${borderClass} p-8 space-y-6 flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${isEmUso ? 'bg-gray-50' : ''}`}>
                {/* In-Use Bar */}
                {isEmUso && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-30"></div>
                )}

                {/* Top Row: ID, Status, X */}
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">ID {(index + 1).toString().padStart(2, '0')}</span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${item.status === 'Finalizado' ? 'bg-emerald-50 text-emerald-600' : item.status === 'Em Conferência' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
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
                    >✕</button>
                  )}
                </div>

                {/* OP Section */}
                <div className="space-y-4 relative z-10">
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-tight">OP Lote-{opDisplay}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight flex items-center gap-2">
                    <span>📍 Armazém: {item.armazem}</span>
                    <span className="opacity-30">|</span>
                    <span>📋 DOC: {item.itens?.[0]?.doc_transferencia || item.documento}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</p>
                      <p className="text-xs font-black text-gray-900">{item.status || 'Pendente'}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">🔢 Itens</p>
                      <p className="text-xs font-black text-gray-900">
                        {item.itens?.filter((i: any) => (i.composicao || []).every((c: any) => c.ok_conf)).length || 0}/{item.itens?.length || 0} ITENS
                      </p>
                    </div>
                  </div>
                </div>

                {/* Fixed Footer Button */}
                <div className="pt-4 relative z-10 border-t border-gray-50">
                  <button
                    onClick={() => handleStart(item)}
                    disabled={isEmUso}
                    className={`w-full py-4 rounded-[1.25rem] text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${isEmUso
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
                      }`}
                  >
                    {isEmUso ? `Em uso: ${item.responsavel_conferencia}` : 'Abrir Conferência'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Divergence Modal (More or Less) */}
      {showDivModal && divItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDivModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp overflow-hidden">
            <div className="bg-orange-500 -m-10 p-10 mb-8 border-b border-orange-600 flex justify-between items-center text-white relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-white/20 animate-pulse"></div>
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tighter">🚨 Divergência Grave</h3>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Item: {divItem.codigo}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Justificativa da Divergência (Mais ou Menos):</p>
              <textarea
                className="w-full h-32 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-bold text-gray-800 outline-none focus:ring-4 focus:ring-orange-50 transition-all resize-none shadow-inner"
                placeholder="Descreva o motivo (Ex: Falta física, Sobra no lote, Erro de etiqueta...)"
                value={divReason}
                onChange={(e) => setDivReason(e.target.value)}
              />
            </div>
            <button onClick={handleConfirmDivergencia} className="w-full py-5 bg-orange-500 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-orange-600 transition-all active:scale-95 border-b-4 border-orange-700">Notificar Alerta e Salvar</button>
          </div>
        </div>
      )}

      {/* Observations Modal */}
      {showObsModal && obsItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowObsModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 animate-slideInUp">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Anotações 🗨️</h3>
              <button onClick={() => setShowObsModal(false)} className="text-gray-300 hover:text-gray-900 transition-colors">✕</button>
            </div>
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 italic text-[10px] font-bold text-gray-400">
                Editando observação da OP: {obsItem.currentOp}
              </div>
              <textarea
                className="w-full h-40 bg-white border border-gray-200 rounded-2xl p-6 text-sm font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                placeholder="Observação da conferência..."
                defaultValue={(obsItem.composicao || []).find((c: any) => c.op === obsItem.currentOp)?.observacao || ''}
                onBlur={(e) => handleSaveObs(obsItem.codigo, obsItem.currentOp, e.target.value)}
              />
              <button onClick={() => setShowObsModal(false)} className="w-full py-5 bg-gray-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all">Confirmar e Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conferencia;
