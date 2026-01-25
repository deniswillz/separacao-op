
import React, { useState, useEffect } from 'react';
import { UrgencyLevel, User } from '../types';
import { BlacklistItem } from '../App';
import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


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
    }
  };

  const getOPDisplayRange = (ordens: string[]) => {
    if (!ordens || ordens.length === 0) return 'S/N';
    if (ordens.length === 1) {
      // If matches 00XXXX01001 pattern, extract XXXX
      const match = ordens[0].match(/00(\d{4})01001/);
      return match ? match[1] : ordens[0].slice(-6);
    }

    const formatted = ordens.map(op => {
      const match = op.match(/00(\d{4})01001/);
      return match ? match[1] : op.slice(-6);
    });

    const unique = Array.from(new Set(formatted)).sort();
    if (unique.length > 1) {
      return `${unique[0]} - ${unique[unique.length - 1]}`;
    }
    return unique[0];
  };

  const handleFinalize = async () => {
    if (!selectedOP || !docTransferencia) {
      alert('⚠️ Informe o Documento de Transferência');
      return;
    }

    const isComplete = selectedOP.rawItens.every(i => {
      const blacklistItem = blacklist.find(b => b.sku === i.codigo || (b as any).codigo === i.codigo);
      if (blacklistItem?.nao_sep) return true;

      if (i.falta) return true;

      const isLupaDone = i.composicao?.every((c: any) => c.concluido);

      return i.ok && isLupaDone && i.tr;
    });

    if (!isComplete) {
      alert('❌ PROCESSO IMPEDIDO DE CONTINUAR\n\nTodos os itens devem passar pelas 3 etapas obrigatórias (OK, Lupa, TR) ou serem marcados como OUT.');
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

      const { data: tea } = await supabase.from('historico').select('*').eq('documento', selectedOP.opCode).maybeSingle();
      if (tea) {
        const newFluxo = [...(tea.itens || []), { status: 'Conferência', icon: '🔍', data: new Date().toLocaleDateString('pt-BR') }];
        await supabase.from('historico').update({ itens: newFluxo }).eq('id', tea.id);
      }

      // Artificial delay to ensure user perceives the transition
      await new Promise(resolve => setTimeout(resolve, 800));

      setViewMode('list'); setSelectedOP(null);
    } catch (e: any) {
      alert('Erro ao finalizar: ' + e.message);
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
    if (error) alert('Erro ao salvar observação: ' + error.message);
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
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47] shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Separação</h1>
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
          <button onClick={handleBack} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">← Voltar</button>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 p-8 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center text-xl font-black">📦</div>
                <h2 className="text-2xl font-black tracking-tight uppercase">{selectedOP.opCode}</h2>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right bg-white p-2 px-4 rounded-xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Separador</p>
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
                  className="px-6 py-4 bg-white border border-gray-200 rounded-2xl text-[11px] font-black uppercase outline-none focus:ring-4 focus:ring-emerald-50 transition-all w-64"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-8 py-5 text-center">LUPA</th>
                    <th className="px-8 py-5">PRODUTO</th>
                    <th className="px-6 py-5 text-center">SOLICITADO</th>
                    <th className="px-6 py-5 text-center">SEPARADO</th>
                    <th className="px-10 py-5 text-center">AÇÕES</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
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

                      const rowClass = isOut ? 'bg-red-50 border-l-4 border-red-500' :
                        (item.ok && isLupaDone && item.tr) ? 'bg-emerald-50/50' :
                          isTalvez ? 'border-l-4 border-amber-500' : '';

                      return (
                        <tr key={idx} className={`group ${rowClass} transition-colors`}>
                          <td className="px-8 py-6 text-center">
                            <button
                              disabled={isOut}
                              onClick={() => { setLupaItem(item); setShowLupaModal(true); }}
                              className={`w-12 h-12 rounded-xl text-lg transition-all flex items-center justify-center border ${isOut ? 'opacity-20 cursor-not-allowed bg-gray-100' :
                                isLupaDone
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100 font-bold'
                                  : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                                }`}
                              title="LUPA - Distribuição p/ OP"
                            >
                              🔍
                            </button>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-[#111827] text-sm font-mono tracking-tighter">
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
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-2">{item.descricao}</p>
                            <div className="flex items-center gap-4 text-[9px] font-black uppercase text-gray-400">
                              <p>.Armazém: <span className="text-gray-900">{armazem}</span></p>
                              <p>Endereço: <span className="text-emerald-600 font-mono tracking-widest">{endereco}</span></p>
                            </div>
                          </td>
                          <td className="px-6 py-6 text-center text-lg font-black text-gray-900">{item.quantidade}</td>
                          <td className="px-6 py-6 text-center">
                            <input
                              type="number"
                              disabled={isOut}
                              className={`w-20 px-3 py-2 bg-white border rounded-xl text-center font-black text-sm outline-none transition-all ${isOut ? 'opacity-20 bg-gray-50' : item.qtd_separada > item.quantidade ? 'border-red-500 ring-4 ring-red-50' : 'border-gray-200 focus:ring-4 focus:ring-emerald-50'}`}
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

            <div className="p-10 bg-gray-50/80 border-t border-gray-100 flex justify-center">
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
                      alert('Erro ao salvar. Tente novamente.');
                    } finally {
                      setIsFinalizing(false);
                    }
                  }}
                  className="flex-1 py-5 bg-white border-2 border-gray-100 text-gray-500 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
              op.status === 'Pendente' ? 'border-amber-500' : 'border-gray-50';

            return (
              <div key={op.id} className={`bg-white rounded-[2rem] border-2 shadow-sm p-8 space-y-6 flex flex-col justify-between hover:shadow-xl transition-all group relative overflow-hidden ${isEmUso ? 'bg-gray-50' : ''} ${borderClass}`}>
                {/* In-Use Bar */}
                {isEmUso && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-30"></div>
                )}

                {/* Top Row: ID, Priority, X */}
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">ID {(index + 1).toString().padStart(2, '0')}</span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${styles.bg} ${styles.text}`}>
                      {op.urgencia.toUpperCase()}
                    </span>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir Lote: ${op.opCode}?`)) {
                          supabase.from('separacao').delete().eq('id', op.id).then(() => fetchOps());
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Lote: {op.ordens.map(o => o.replace(/^00/, '').replace(/01001$/, '')).join(', ')}</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOpForList(op);
                        setShowOpListModal(true);
                      }}
                      className="text-blue-500 text-xs hover:scale-125 transition-transform p-1"
                      title="Ver lista completa de OPs"
                    >
                      🔍
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">📍 Armazém</p>
                      <p className="text-xs font-black text-gray-900 truncate">{op.armazem}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">📦 Ordens</p>
                      <p className="text-xs font-black text-gray-900">{op.ordens.length}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">📋 Itens</p>
                      <p className="text-xs font-black text-gray-900">{finalizedCount}/{total}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">👤 Resp.</p>
                      <p className={`text-xs font-black truncate ${op.usuarioAtual ? 'text-emerald-600' : 'text-gray-300'}`}>
                        {op.usuarioAtual || 'Aguardando'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress Visual */}
                <div className="space-y-3 relative z-10 pt-4 border-t border-gray-50">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Concluídos</p>
                      <p className="text-sm font-black text-gray-900">{finalizedCount}/{total}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Progresso</p>
                      <p className={`text-sm font-black ${progress === 100 ? 'text-emerald-600' : 'text-gray-900'}`}>{progress}%</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-700 ${progress === 100 ? 'bg-emerald-500' : 'bg-gray-900'}`} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                {/* Footer and Button */}
                <div className="space-y-4 pt-4 relative z-10">
                  <div className="flex justify-between items-center text-[10px] font-black text-gray-300 uppercase tracking-widest">
                    <span className={op.status === 'Pendente' ? 'text-amber-500' : 'text-gray-300'}>{op.status || 'PENDENTE'}</span>
                    <span>{new Date(op.data).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => handleStart(op)}
                    disabled={isEmUso}
                    className={`w-full py-4 rounded-[1.25rem] text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${isEmUso
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed shadow-none'
                      : 'bg-gray-900 text-white hover:bg-black shadow-gray-100'
                      }`}
                  >
                    {isEmUso ? 'Em Uso' : 'Iniciar Separação'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      )}

      {showLupaModal && lupaItem && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-fadeIn">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowLupaModal(false); setLupaItem(null); }}></div>
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl border-l border-gray-100 flex flex-col animate-slideInRight">
            <div className="p-8 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none mb-1 text-emerald-600">Distribuição de Lote</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{lupaItem.codigo}</p>
              </div>
              <button onClick={() => { setShowLupaModal(false); setLupaItem(null); }} className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all font-bold">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center text-lg">🔍</div>
                <p className="text-[9px] font-black text-emerald-700 uppercase leading-relaxed tracking-wider">Distribua as quantidades separadas em cada OP original para garantir a rastreabilidade.</p>
              </div>

              <div className="space-y-4">
                {(lupaItem.composicao || []).map((comp: any, idx: number) => {
                  const isDivergent = comp.qtd_separada !== comp.quantidade;
                  return (
                    <div key={idx} className={`p-6 border rounded-2xl hover:border-emerald-200 transition-all group space-y-4 ${isDivergent ? 'bg-orange-50/50 border-orange-200 shadow-sm' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${isDivergent ? 'bg-orange-600' : 'bg-gray-900'} text-white rounded-xl flex items-center justify-center text-[9px] font-black tracking-widest overflow-hidden`}>
                            {comp.op.slice(-4)}
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">OP Original</p>
                            <p className="text-xs font-black text-gray-900 font-mono tracking-tighter">{comp.op}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newComp = [...lupaItem.composicao];
                            newComp[idx] = { ...newComp[idx], concluido: !newComp[idx].concluido };
                            if (newComp[idx].concluido && (newComp[idx].qtd_separada === undefined || newComp[idx].qtd_separada === null)) {
                              newComp[idx].qtd_separada = comp.quantidade;
                            }
                            const totalSep = newComp.reduce((sum, c) => sum + (c.qtd_separada || 0), 0);
                            if (!selectedOP) return;
                            const newItens = selectedOP.rawItens.map(i => i.codigo === lupaItem.codigo ? { ...i, composicao: newComp, qtd_separada: totalSep } : i);

                            // Auto-save Lupa changes
                            supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id).then(({ error }) => {
                              if (!error) {
                                setSelectedOP({ ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) });
                                setLupaItem({ ...lupaItem, composicao: newComp, qtd_separada: totalSep });
                              }
                            });
                          }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm transition-all ${comp.concluido ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-gray-50 text-gray-300 border border-gray-100 group-hover:bg-white group-hover:border-emerald-100'}`}
                        >
                          {comp.concluido ? '✅' : '○'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Solicitada</p>
                          <div className="bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-black text-gray-400 border border-transparent">{comp.quantidade}</div>
                        </div>
                        <div>
                          <p className={`text-[8px] font-black ${isDivergent ? 'text-orange-600' : 'text-emerald-600'} uppercase tracking-widest mb-1.5`}>Separada (Lupa)</p>
                          <input
                            type="number"
                            className={`w-full bg-white border px-4 py-2 rounded-xl text-sm font-black outline-none transition-all ${isDivergent ? 'border-orange-200 text-orange-600 focus:ring-orange-50' : 'border-emerald-100 text-emerald-600 focus:ring-emerald-50'}`}
                            value={comp.qtd_separada ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const newComp = [...lupaItem.composicao];
                              newComp[idx] = { ...newComp[idx], qtd_separada: val, concluido: true };
                              const totalSep = newComp.reduce((sum, c) => sum + (c.qtd_separada || 0), 0);
                              if (!selectedOP) return;
                              const newItens = selectedOP.rawItens.map(i => i.codigo === lupaItem.codigo ? { ...i, composicao: newComp, qtd_separada: totalSep } : i);

                              // Auto-save quantity inputs
                              supabase.from('separacao').update({ itens: newItens }).eq('id', selectedOP.id).then(({ error }) => {
                                if (!error) {
                                  setSelectedOP({ ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) });
                                  setLupaItem({ ...lupaItem, composicao: newComp, qtd_separada: totalSep });
                                }
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 border-t border-gray-100 flex flex-col gap-4">
              <div className="flex justify-between items-center px-2">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total Distribuído</p>
                <p className="text-lg font-black text-emerald-600">{(lupaItem.composicao || []).reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0)}</p>
              </div>
              <button onClick={() => { setShowLupaModal(false); setLupaItem(null); }} className="w-full py-5 bg-[#111827] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all">Confirmar Distribuição</button>
            </div>
          </div>
        </div>
      )}

      {showObsModal && obsItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center animate-fadeIn">
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
              {(obsItem.composicao || []).map((comp: any, i: number) => (
                <div key={i} className="space-y-3 p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <div className="flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    <span>OP: {comp.op}</span>
                  </div>
                  <textarea
                    className="w-full h-24 bg-white border border-gray-100 rounded-2xl p-4 text-xs font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                    placeholder="Digite sua observação aqui..."
                    defaultValue={comp.observacao || ''}
                    onBlur={(e) => handleSaveObs(obsItem.codigo, comp.op, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <button onClick={() => setShowObsModal(false)} className="w-full py-5 bg-[#111827] text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all">Confirmar e Fechar</button>
          </div>
        </div>
      )}

      {showOpListModal && selectedOpForList && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center animate-fadeIn">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowOpListModal(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase">Lista de OPs</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{selectedOpForList.ordens.length} ordens neste lote</p>
              </div>
              <button onClick={() => setShowOpListModal(false)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-xs font-black text-gray-300 hover:bg-gray-100 hover:text-gray-900 transition-all">✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {selectedOpForList.ordens.map((opCode: string, i: number) => (
                <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl hover:bg-emerald-50 transition-colors group">
                  <span className="text-xs font-black text-gray-600 group-hover:text-emerald-700">{opCode}</span>
                  <span className="px-3 py-1 bg-white border border-gray-100 rounded-lg text-[8px] font-black text-gray-300 uppercase">Pendente</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowOpListModal(false)} className="w-full py-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">Fechar Lista</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Separacao;
