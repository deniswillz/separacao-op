
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { BlacklistItem } from '../App';
import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


interface ConfItem {
  id: string;
  documento: string;
  nome: string;
  armazem: string;
  ordens: string[];
  itens: any[];
  status: string;
  data_conferencia: string;
  responsavel_conferencia: string | null;
}


const Conferencia: React.FC<{ blacklist: BlacklistItem[], user: User }> = ({ blacklist, user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [items, setItems] = useState<ConfItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConfItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTransferList, setShowTransferList] = useState(false);
  const [selectedOpForDetail, setSelectedOpForDetail] = useState<string | null>(null);
  const [showObsModal, setShowObsModal] = useState(false);
  const [obsItem, setObsItem] = useState<any | null>(null);

  const [showDivModal, setShowDivModal] = useState(false);
  const [divItem, setDivItem] = useState<any | null>(null);
  const [divReason, setDivReason] = useState('');

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('conferencia').select('*').order('data_conferencia', { ascending: false });
    if (error) console.error(error);
    else if (data) setItems(data);
    setIsLoading(false);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Deseja excluir esta conferência?')) return;
    const { error } = await supabase.from('conferencia').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchItems();
  };

  useEffect(() => {
    fetchItems();
    const channel = supabase.channel('conf-live').on('postgres_changes', { event: '*', schema: 'public', table: 'conferencia' }, fetchItems).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleOpen = async (item: ConfItem) => {
    if (item.responsavel_conferencia && item.responsavel_conferencia !== user.nome) {
      alert(`⚠️ Bloqueio: Em uso por "${item.responsavel_conferencia}"`);
      return;
    }
    const sortedItens = (item.itens || []).sort((a: any, b: any) => a.codigo.localeCompare(b.codigo));
    await supabase.from('conferencia').update({ responsavel_conferencia: user.nome, status: 'Em Conferência' }).eq('id', item.id);
    setSelectedItem({ ...item, itens: sortedItens, responsavel_conferencia: user.nome, status: 'Em Conferência' });
    setViewMode('detail');

  };

  const handleBack = async () => {
    if (selectedItem) await supabase.from('conferencia').update({ responsavel_conferencia: null }).eq('id', selectedItem.id);
    setViewMode('list'); setSelectedItem(null);
  };

  const handleToggleCheck = async (sku: string, op: string, field: 'ok' | 'ok2' | 'falta') => {
    if (!selectedItem) return;

    if (field === 'falta') {
      const item = selectedItem.itens.find(i => i.codigo === sku);
      const comp = item?.composicao?.find((c: any) => c.op === op);
      if (comp && !comp.falta_conf) {
        setDivItem({ ...item, op });
        setDivReason('');
        setShowDivModal(true);
        return;
      }
    }

    const newItens = selectedItem.itens.map(item => {
      if (item.codigo === sku) {
        const newComp = (item.composicao || []).map((c: any) => {
          if (c.op === op) {
            const f = field === 'ok' ? 'ok_conf' : field === 'ok2' ? 'ok2_conf' : 'falta_conf';
            const newVal = !c[f];

            // Sync logic: If TR (ok2) is checked, Visual (ok) must also be checked
            const updatedOk = (field === 'ok2' && newVal) ? true : c.ok_conf;

            return {
              ...c,
              [f]: newVal,
              ok_conf: field === 'falta' ? false : (field === 'ok' ? newVal : updatedOk),
              ok2_conf: field === 'falta' ? false : (field === 'ok2' ? newVal : c.ok2_conf)
            };
          }
          return c;
        });
        return { ...item, composicao: newComp };
      }
      return item;
    });

    const { error } = await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    if (!error) setSelectedItem({ ...selectedItem, itens: newItens });
    else console.error('Erro ao sincronizar check:', error);
  };

  const handleConfirmDivergencia = async () => {
    if (!selectedItem || !divItem) return;

    const newItens = selectedItem.itens.map(item => {
      if (item.codigo === divItem.codigo) {
        const newComp = (item.composicao || []).map((c: any) => {
          if (c.op === divItem.op) {
            window.dispatchEvent(new CustomEvent('falta-detectada', {
              detail: {
                op: c.op,
                produto: `${item.codigo} - ${item.descricao}`,
                motivo: divReason || 'Não especificado'
              }
            }));
            return {
              ...c,
              falta_conf: true,
              ok_conf: false,
              ok2_conf: false,
              motivo_divergencia: divReason || 'Não especificado'
            };
          }
          return c;
        });
        return { ...item, composicao: newComp };
      }
      return item;
    });

    const { error } = await supabase.from('conferencia').update({
      itens: newItens,
      status: 'Pendente' // Ensure status reflects activity
    }).eq('id', selectedItem.id);

    if (!error) {
      setSelectedItem({ ...selectedItem, itens: newItens });
      setShowDivModal(false);
      setDivItem(null);
    } else {
      alert('Erro ao registrar divergência no banco: ' + error.message);
    }
  };

  const handleSavePendency = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      await supabase.from('conferencia').update({
        itens: selectedItem.itens,
        status: 'Pendente'
      }).eq('id', selectedItem.id);
      alert('Progresso salvo com sucesso!');
      setViewMode('list');
      setSelectedItem(null);
      fetchItems();
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedItem) return;

    const hasFalta = selectedItem.itens.some(i => i.falta);
    if (hasFalta) {
      alert('🚨 Não é possível finalizar com itens em FALTA. Use "Salvar com Pendências".');
      return;
    }

    const allChecked = selectedItem.itens.every(item => {
      const blacklistItem = blacklist.find(b => b.codigo === item.codigo);
      if (blacklistItem?.nao_sep) return true;

      return (item.composicao || []).every((c: any) => {
        if (c.falta_conf) return true;
        return c.ok_conf && c.ok2_conf;
      });
    });

    if (!allChecked) {
      alert('⚠️ PROCESSO PENDENTE:\n\nTodos os itens devem passar pelo 1º Check (OK) e pelo 2º Check (Lista de Transferência) antes de finalizar.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Move conference to finished (status update)
      await supabase.from('conferencia').update({
        status: 'Finalizado',
        data_conferencia: new Date().toISOString(),
        responsavel_conferencia: user.nome
      }).eq('id', selectedItem.id);

      // 2. Update TEA (historico table) to "Qualidade" for each OP
      const uniqueOps = [...new Set(selectedItem.itens.map(i => i.op))];
      for (const opCode of uniqueOps) {
        // Find the record in historico for this OP
        const { data: histData } = await supabase.from('historico').select('*').eq('documento', opCode).single();
        if (histData) {
          const newFluxo = [...(histData.itens || []), {
            status: 'Qualidade',
            icon: '🔍',
            data: new Date().toLocaleDateString('pt-BR')
          }];
          await supabase.from('historico').update({
            itens: newFluxo,
            status_atual: 'Qualidade'
          }).eq('id', histData.id);
        }
      }

      alert('Conferência finalizada e TEA atualizado!');
      setViewMode('list');
      setSelectedItem(null);
      fetchItems();
    } catch (error: any) {
      alert('Erro ao finalizar: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveObs = async (sku: string, op: string, text: string) => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map(item => {
      if (item.codigo === sku) {
        const newComp = (item.composicao || []).map((c: any) => c.op === op ? { ...c, observacao: text } : c);
        return { ...item, composicao: newComp };
      }
      return item;
    });

    const { error } = await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
    if (error) alert('Erro ao salvar observação: ' + error.message);
    else setSelectedItem({ ...selectedItem, itens: newItens });
  };

  if (isLoading && items.length === 0) {
    return <Loading message="Sincronizando Conferência..." />;
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Conferência</h1>
        <div className="text-[10px] font-bold text-gray-400 uppercase">
          Data do Sistema: <span className="text-[#006B47]">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      {viewMode === 'detail' && selectedItem ? (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex justify-between items-center">
            <button onClick={handleBack} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">← Voltar</button>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase">Documento</p>
                <p className="text-xs font-black text-gray-900">{selectedItem.itens[0]?.doc_transferencia || 'N/A'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase">Responsável</p>
                <p className="text-xs font-black text-[#006B47]">{user.nome}</p>
              </div>
            </div>
          </div>

          {/* Ordens de Produção - Status Row */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase tracking-tight">
              <span>📋</span> Ordens de Produção - Status
            </div>
            <div className="flex flex-wrap gap-2">
              {[...new Set(selectedItem.itens.flatMap(i => (i.composicao || []).map((c: any) => c.op)))].map(opCode => {
                const opItensComps = selectedItem.itens.flatMap(i => (i.composicao || []).filter((c: any) => c.op === opCode));
                const isDone = opItensComps.every(c => c.ok_conf);
                const isSelected = selectedOpForDetail === opCode;
                return (
                  <button
                    key={opCode}
                    onClick={() => setSelectedOpForDetail(isSelected ? null : opCode)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all border ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                      } ${isDone
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                  >
                    {isDone ? '✅' : '⏳'} OP {opCode}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <tr>
                      <th className="px-8 py-5 text-center">OBS 🗨️</th>
                      <th className="px-8 py-5">PRODUTO / OP</th>
                      <th className="px-6 py-5 text-center">SOLICITADO</th>
                      <th className="px-6 py-5 text-center">SEPARADO</th>
                      <th className="px-10 py-5 text-center">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItem.itens
                      .filter(item => {
                        const blacklistItem = blacklist.find(b => b.codigo === item.codigo);
                        if (blacklistItem?.nao_sep) return false;
                        return true;
                      })
                      .flatMap(item => (item.composicao || []).map((comp: any) => ({ ...item, ...comp })))
                      .filter(row => !selectedOpForDetail || row.op === selectedOpForDetail)
                      .map((row, idx) => {
                        const isOut = !!row.falta_conf;
                        const rowClass = isOut ? 'bg-red-50 border-l-4 border-red-500' :
                          (row.ok_conf && row.ok2_conf) ? 'bg-emerald-50/30 font-bold' : '';

                        return (
                          <tr key={`${row.codigo}-${row.op}-${idx}`} className={`group ${rowClass} transition-all`}>
                            <td className="px-8 py-6 text-center">
                              <button
                                disabled={isOut}
                                onClick={() => { setObsItem(row); setShowObsModal(true); }}
                                className={`w-12 h-12 rounded-xl text-lg transition-all flex items-center justify-center border ${isOut ? 'opacity-20 cursor-not-allowed bg-gray-100' :
                                  'bg-white border-gray-200 hover:bg-gray-50'
                                  } ${row.observacao ? 'text-blue-500' : 'text-gray-300'}`}
                                title="OBSERVAÇÕES / NOTAS (🗨️)"
                              >
                                🗨️
                              </button>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-black text-gray-900 font-mono">{row.codigo}</p>
                                {row.observacao && <span title="Possui Observações">🗨️</span>}
                              </div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase truncate max-w-xs">{row.descricao}</p>
                              <p className="text-[9px] font-black text-blue-600 mt-1 uppercase">OP: {row.op}</p>
                            </td>
                            <td className="px-6 py-6 text-center text-sm font-black text-gray-400">
                              {/* Always show what the OP originally asked for */}
                              {row.original_solicitado || row.quantidade}
                            </td>
                            <td className="px-6 py-6 text-center text-sm font-black text-gray-900">
                              {/* This is what was actually separated and transmitted */}
                              {row.quantidade}
                            </td>
                            <td className="px-10 py-6">
                              <div className="flex justify-center gap-2">
                                <button
                                  disabled={isOut}
                                  onClick={() => handleToggleCheck(row.codigo, row.op, 'ok')}
                                  className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${isOut ? 'opacity-20 cursor-not-allowed' : row.ok_conf ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50'}`}
                                  title="1º Check: Conferência Visual"
                                >
                                  OK
                                </button>
                                <button
                                  disabled={isOut}
                                  onClick={() => setShowTransferList(true)}
                                  className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${isOut ? 'opacity-20 cursor-not-allowed' : row.ok2_conf ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border border-gray-200 text-blue-600 hover:bg-blue-50'}`}
                                  title="2º Check: Lista de Transferência"
                                >
                                  TR
                                </button>
                                <button
                                  onClick={() => handleToggleCheck(row.codigo, row.op, 'falta')}
                                  className={`px-6 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${row.falta_conf ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white border border-gray-200 text-red-600 hover:bg-red-50'}`}
                                  title="Divergência / Falta (🚨)"
                                >
                                  🚨 FALTA
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo da Conferência</h3>

                {(() => {
                  const allComps = selectedItem.itens.flatMap(i => i.composicao || []);
                  const doneComps = allComps.filter((c: any) => c.ok_conf).length;
                  const divComps = allComps.filter((c: any) => c.falta_conf).length;
                  const perc = allComps.length > 0 ? Math.round((doneComps / allComps.length) * 100) : 0;
                  return (
                    <>
                      <div className="space-y-4">
                        <div className="flex justify-between items-end">
                          <p className="text-[9px] font-black text-emerald-600 uppercase">Progresso Geral</p>
                          <p className="text-2xl font-black text-gray-900">{perc}%</p>
                        </div>
                        <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${perc}%` }}></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                        <div className="bg-emerald-50 p-4 rounded-2xl flex justify-between items-center">
                          <p className="text-[10px] font-black text-emerald-600 uppercase">Itens OK</p>
                          <p className="text-xl font-black text-emerald-700">{doneComps}</p>
                        </div>
                        <div className="bg-amber-50 p-4 rounded-2xl flex justify-between items-center">
                          <p className="text-[10px] font-black text-amber-600 uppercase">Divergências</p>
                          <p className="text-xl font-black text-amber-700">{divComps}</p>
                        </div>
                      </div>
                    </>
                  );
                })()}

                <button
                  onClick={handleFinalize}
                  className="w-full py-5 bg-[#006B47] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-[#004D33] active:scale-95 transition-all mt-4"
                >
                  Finalizar e Salvar
                </button>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    onClick={() => setShowTransferList(true)}
                    className="py-4 bg-gray-50 text-gray-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all border border-gray-100"
                  >
                    Lista de Transferência
                  </button>
                  <button
                    onClick={handleSavePendency}
                    disabled={isSaving}
                    className="py-4 bg-gray-50 text-gray-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all border border-gray-100"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Pendências'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, index) => {
            const isAguardando = item.status === 'Aguardando' || !item.responsavel_conferencia;
            const isEmUso = item.responsavel_conferencia && item.responsavel_conferencia !== user.nome;

            return (
              <div key={item.id} className={`bg-white rounded-[2rem] border border-gray-100 p-6 space-y-4 flex flex-col justify-between hover:shadow-md transition-all group relative overflow-hidden ${isEmUso ? 'bg-gray-50 grayscale' : ''}`}>
                {/* In-Use Overlay */}
                {isEmUso && (
                  <div className="absolute inset-0 bg-gray-100/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center text-center p-4">
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Em uso por</p>
                      <p className="text-xs font-black text-gray-900">{item.responsavel_conferencia}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4 relative z-10">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-gray-400">ID {(index + 1).toString().padStart(2, '0')}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isAguardando ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                        {isAguardando ? 'AGUARDANDO' : 'EM CONFERENCIA'}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="text-gray-300 hover:text-red-500 font-black text-xs transition-colors">✕</button>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-gray-900 uppercase">OP {item.nome || item.documento}</h3>
                    <div className="grid grid-cols-2 gap-y-1 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px]">📍</span>
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Armazém: <span className="text-gray-900">{item.armazem}</span></p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px]">📋</span>
                        <p className="text-[9px] font-bold text-gray-400 uppercase truncate">DOC: <span className="text-blue-600 font-mono">{item.itens?.[0]?.doc_transferencia || 'S/N'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-y py-3">
                    <div className="text-center">
                      <p className="text-[8px] font-black text-gray-300 uppercase">Status</p>
                      <p className="text-[10px] font-black text-gray-900">{item.status}</p>
                    </div>
                    <div className="text-center border-l">
                      <p className="text-[8px] font-black text-gray-300 uppercase">Itens</p>
                      <p className="text-[10px] font-black text-gray-900">{item.itens?.length || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-2">
                  <button
                    disabled={isEmUso}
                    onClick={() => handleOpen(item)}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all disabled:opacity-50"
                  >
                    Abrir Conferência
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showTransferList && selectedItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowTransferList(false)}></div>
          <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideInUp">
            {/* Header */}
            <div className="bg-[#006B47] p-8 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📋</span>
                <h3 className="text-xl font-black uppercase tracking-widest">Lista de Transferência</h3>
              </div>
              <button onClick={() => setShowTransferList(false)} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all">✕</button>
            </div>

            {/* Info Row */}
            <div className="p-8 space-y-2 border-b">
              <p className="text-sm font-black text-gray-900">Documento de Transferência: <span className="text-gray-500 font-mono">{selectedItem.itens[0]?.doc_transferencia || 'S/N'}</span></p>
              <p className="text-sm font-black text-gray-900">Responsável Separação: <span className="text-gray-500">{selectedItem.responsavel_conferencia}</span></p>
              <p className="text-sm font-black text-gray-900">Verificados: <span className="text-gray-500">{selectedItem.itens.filter(i => i.ok).length}/{selectedItem.itens.length} ⏳</span></p>
            </div>

            {/* Table */}
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                  <tr>
                    <th className="pb-4">OK</th>
                    <th className="pb-4">CÓDIGO</th>
                    <th className="pb-4">DESCRIÇÃO</th>
                    <th className="pb-4 text-center">QTD SOLIC.</th>
                    <th className="pb-4 text-center">QTD SEPAR.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedItem.itens
                    .filter(item => {
                      const blacklistItem = blacklist.find(b => b.codigo === item.codigo);
                      return !blacklistItem?.nao_sep;
                    })
                    .flatMap(item => (item.composicao || []).map((comp: any) => ({ ...item, ...comp })))
                    // Filter by OP if selected in status bar
                    .filter(row => !selectedOpForDetail || row.op === selectedOpForDetail)
                    .map((row, idx) => (
                      <tr key={idx} className="group">
                        <td className="py-4">
                          <input
                            type="checkbox"
                            checked={row.ok2_conf}
                            onChange={() => handleToggleCheck(row.codigo, row.op, 'ok2')}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-50"
                          />
                        </td>
                        <td className="py-4">
                          <p className="text-xs font-black text-gray-700 font-mono">{row.codigo}</p>
                          <p className="text-[8px] font-bold text-gray-400">OP: {row.op}</p>
                        </td>
                        <td className="py-4 text-xs font-bold text-gray-400 uppercase">{row.descricao}</td>
                        <td className="py-4 text-center text-xs font-black text-gray-700">
                          {/* Use original solicitado from OP */}
                          {row.original_solicitado || row.quantidade}
                        </td>
                        <td className={`py-4 text-center text-xs font-black ${row.quantidade < (row.original_solicitado || row.quantidade) ? 'text-red-500' : 'text-gray-700'}`}>
                          {row.quantidade}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                <span className="text-amber-500">⚠️</span>
                <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">
                  A <span className="font-black">Qtd Separada</span> é vinculada ao valor definido na Lupa durante a separação. Itens em vermelho indicam quantidade menor que a solicitada.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 bg-gray-50 flex justify-end gap-4">
              <button onClick={() => setShowTransferList(false)} className="px-8 py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-white shadow-sm transition-all">Fechar</button>
              <button
                onClick={async () => {
                  if (!selectedItem) return;
                  const newItens = selectedItem.itens.map(i => {
                    const blacklistItem = blacklist.find(b => b.codigo === i.codigo);
                    if (blacklistItem?.nao_sep) return i;
                    const newComp = (i.composicao || []).map((c: any) => ({ ...c, ok2_conf: true, ok_conf: true }));
                    return { ...i, composicao: newComp };
                  });
                  setSelectedItem({ ...selectedItem, itens: newItens });
                  await supabase.from('conferencia').update({ itens: newItens }).eq('id', selectedItem.id);
                }}
                className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <span>✅</span> Marcar Todos (2º Check)
              </button>
            </div>
          </div>
        </div>
      )}
      {showObsModal && obsItem && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowObsModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase">Observações</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{obsItem.codigo}</p>
              </div>
              <button onClick={() => setShowObsModal(false)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-xs font-black text-gray-300 hover:bg-gray-100 hover:text-gray-900 transition-all">✕</button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              <div className="space-y-3 p-6 bg-gray-50 rounded-3xl border border-gray-100">
                <div className="flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  <span>OP: {obsItem.op}</span>
                </div>
                <textarea
                  className="w-full h-32 bg-white border border-gray-100 rounded-2xl p-4 text-xs font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                  placeholder="Digite sua observação aqui..."
                  defaultValue={obsItem.observacao || ''}
                  onBlur={(e) => handleSaveObs(obsItem.codigo, obsItem.op, e.target.value)}
                />
              </div>

              {obsItem.composicao?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-3">Histórico de Composição</p>
                  <div className="space-y-2">
                    {obsItem.composicao.map((comp: any, i: number) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl text-[10px] font-bold text-gray-400">
                        <span>OP {comp.op}</span>
                        <span>{comp.qtd_separada || comp.quantidade} {obsItem.unidade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowObsModal(false)}
              className="w-full py-5 bg-[#111827] text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all"
            >
              Confirmar e Fechar
            </button>
          </div>
        </div>
      )}
      {showDivModal && divItem && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center animate-fadeIn p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowDivModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-red-600 uppercase">🚨 Registrar Divergência</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{divItem.codigo}</p>
              </div>
              <button onClick={() => setShowDivModal(false)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-xs font-black text-gray-300 hover:bg-gray-100 hover:text-gray-900 transition-all">✕</button>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-600 uppercase">Descreva o motivo da divergência (excesso/falta):</p>
              <textarea
                autoFocus
                value={divReason}
                onChange={(e) => setDivReason(e.target.value)}
                placeholder="Ex: Entregue 2 a menos, Item trocado, Embalagem avariada..."
                className="w-full h-32 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-red-100 transition-all resize-none"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setShowDivModal(false)}
                className="flex-1 py-4 bg-gray-50 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDivergencia}
                className="flex-[2] py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
              >
                Confirmar Divergência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conferencia;
