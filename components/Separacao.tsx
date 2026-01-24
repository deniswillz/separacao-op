
import React, { useState, useEffect } from 'react';
import { UrgencyLevel, User } from '../types';
import { BlacklistItem } from '../App';
import { supabase } from '../services/supabaseClient';

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

const Separacao: React.FC<{ blacklist: BlacklistItem[], user: User }> = ({ blacklist, user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [ops, setOps] = useState<OPMock[]>([]);
  const [selectedOP, setSelectedOP] = useState<OPMock | null>(null);
  const [docTransferencia, setDocTransferencia] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showLupaModal, setShowLupaModal] = useState(false);
  const [lupaItem, setLupaItem] = useState<any | null>(null);


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

  useEffect(() => {
    fetchOps();
    const channel = supabase.channel('separacao-live').on('postgres_changes', { event: '*', schema: 'public', table: 'separacao' }, fetchOps).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const calculateProgress = (itens: any[]) => {
    if (!itens || itens.length === 0) return 0;
    const count = itens.filter(i => i.separado || i.falta || i.transferido).length;
    return Math.round((count / itens.length) * 100);
  };


  const handleStart = async (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== user.nome) {
      alert(`⚠️ Bloqueio: Em uso por "${op.usuarioAtual}"`);
      return;
    }
    await supabase.from('separacao').update({ usuario_atual: user.nome }).eq('id', op.id);
    setSelectedOP({ ...op, usuarioAtual: user.nome });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedOP) await supabase.from('separacao').update({ usuario_atual: null }).eq('id', selectedOP.id);
    setViewMode('list'); setSelectedOP(null);
  };

  const updateItem = async (itemCodigo: string, field: string, value: any) => {
    if (!selectedOP) return;
    const newItens = selectedOP.rawItens.map(i => i.codigo === itemCodigo ? { ...i, [field]: value } : i);
    setSelectedOP({ ...selectedOP, rawItens: newItens, progresso: calculateProgress(newItens) });
  };

  const handleFinalize = async () => {
    if (!selectedOP || !docTransferencia) {
      alert('⚠️ Informe o Documento de Transferência');
      return;
    }

    const isComplete = selectedOP.rawItens.every(i => i.separado || i.falta || i.transferido);
    if (!isComplete) {
      alert('❌ PROCESSO IMPEDIDO DE CONTINUAR\n\nAssim que todas as opções estiverem em CHECK, você poderá enviar para conferência.');
      return;
    }

    setIsSaving(true);

    const conferenceData = {
      documento: `CC-${selectedOP.opCode}`,
      nome: selectedOP.opCode,
      armazem: selectedOP.armazem,
      ordens: selectedOP.ordens,
      itens: selectedOP.rawItens
        .filter((item: any) => !item.falta) // Don't send OUT items to conference
        .map((item: any) => ({ ...item, doc_transferencia: docTransferencia })),
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

      alert('Lote enviado para Conferência!');
      setViewMode('list'); setSelectedOP(null);
    } catch (e: any) {
      alert('Erro ao finalizar: ' + e.message);
    } finally { setIsSaving(false); }
  };

  const getUrgencyStyles = (urg: string) => {
    if (urg === 'urgencia' || urg === 'URGENCIA') return { border: 'border-red-500', text: 'text-red-500', bg: 'bg-red-50' };
    if (urg === 'alta' || urg === 'ALTA') return { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-50' };
    return { border: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-50' };
  };

  if (isSyncing && ops.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-[#006B47] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-[#006B47] uppercase tracking-widest animate-pulse tracking-[0.2em]">Sincronizando Separação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border-l-4 border-[#006B47]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Separação</h1>
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
              <div className="flex items-center gap-3">
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
                <thead className="bg-[#111827] text-white text-[10px] font-black uppercase tracking-[0.2em]">
                  <tr>
                    <th className="px-8 py-5">CÓDIGO / DESCRIÇÃO</th>
                    <th className="px-6 py-5 text-center">SOLIC.</th>
                    <th className="px-6 py-5 text-center">SEPARADA</th>
                    <th className="px-10 py-5 text-center">AÇÕES</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {selectedOP.rawItens.map((item, idx) => {
                    const isBlacklisted = blacklist.some(b => b.sku === item.codigo);
                    const isOUT = item.falta || isBlacklisted;

                    return (
                      <tr key={idx} className={`group ${item.separado ? 'bg-emerald-50/50' : isOUT ? 'bg-amber-50/50' : item.transferido ? 'bg-blue-50/50' : ''} ${isBlacklisted ? 'border-l-4 border-red-500' : ''}`}>
                        <td className="px-8 py-6">
                          <p className="font-black text-[#111827] text-sm font-mono tracking-tighter flex items-center gap-2">
                            {item.codigo}
                            {isBlacklisted && <span className="px-2 py-0.5 bg-red-500 text-white text-[8px] rounded-full">BLACKLIST</span>}
                          </p>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tight mb-2">{item.descricao}</p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Armazém: <span className="text-gray-900">{selectedOP.armazem}</span></p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Endereço: <span className="text-gray-900">{item.endereco || 'S/E'}</span></p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6 text-center text-lg font-black text-gray-900">{item.quantidade}</td>
                        <td className="px-6 py-6 text-center">
                          <input
                            type="number"
                            className={`w-20 px-3 py-2 bg-white border rounded-xl text-center font-black text-sm outline-none transition-all ${item.qtd_separada > item.quantidade ? 'border-red-500 ring-4 ring-red-50' : 'border-gray-200 focus:ring-4 focus:ring-emerald-50'}`}
                            value={item.qtd_separada || 0}
                            disabled={isOUT}
                            onChange={(e) => updateItem(item.codigo, 'qtd_separada', Number(e.target.value))}
                          />
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => updateItem(item.codigo, 'separado', !item.separado)}
                              disabled={isOUT}
                              className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${item.separado ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:grayscale'}`}
                              title="OK - Separação Manual"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => updateItem(item.codigo, 'transferido', !item.transferido)}
                              disabled={isOUT}
                              className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${item.transferido ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:grayscale'}`}
                              title="TR - Transferência do Item"
                            >
                              TR
                            </button>
                            <button
                              onClick={() => updateItem(item.codigo, 'falta', !item.falta)}
                              disabled={isBlacklisted}
                              className={`w-12 h-12 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center ${isOUT ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'bg-white border border-gray-200 text-amber-500 hover:bg-amber-50'}`}
                              title="OUT - Falta/Blacklist"
                            >
                              OUT
                            </button>
                            <button
                              onClick={() => { setLupaItem(item); setShowLupaModal(true); }}
                              disabled={isOUT}
                              className={`w-12 h-12 rounded-xl text-lg transition-all flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:grayscale ${(item.composicao?.every((c: any) => c.concluido)) ? 'border-emerald-500 text-emerald-500 shadow-lg shadow-emerald-50 font-bold' : 'text-gray-400'}`}
                              title="LUPA - Preencher Qtd p/ OP"
                            >
                              🔍{(item.composicao?.every((c: any) => c.concluido)) && <span className="absolute mt-5 ml-5 text-[10px] bg-white rounded-full">✅</span>}
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
              <button
                onClick={handleFinalize}
                disabled={isSaving}
                className="px-12 py-5 bg-[#006B47] text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-emerald-100 hover:bg-[#004D33] active:scale-95 transition-all flex items-center gap-4"
              >
                {isSaving ? 'PROCESSANDO...' : 'Finalizar Separação'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {ops.map((op, index) => {
            const styles = getUrgencyStyles(op.urgencia);
            return (
              <div key={op.id} className={`bg-white rounded-[2.5rem] border-2 ${styles.border} p-8 space-y-6 flex flex-col justify-between hover:shadow-2xl hover:translate-y-[-8px] transition-all duration-500 group relative overflow-hidden h-[34rem]`}>
                <div className="space-y-6 relative z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-[44px] font-black text-gray-100 group-hover:text-emerald-50 transition-colors leading-none">{(index + 1).toString().padStart(2, '0')}</span>
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${styles.bg} ${styles.text}`}>
                      {op.urgencia.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-2xl font-black text-[#111827] tracking-tighter uppercase leading-none">OP {op.opCode}</h3>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs">📍</span>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Armazém: <span className="text-gray-900">{op.armazem}</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs">📋</span>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ordens: <span className="text-gray-900">{op.ordens.length}</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs">📦</span>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Itens: <span className="text-gray-900">{op.totalItens} ITENS</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs">👤</span>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsável: <span className={op.usuarioAtual ? 'text-emerald-600' : 'text-gray-300 italic'}>{op.usuarioAtual || 'AGUARDANDO'}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100 text-center space-y-1">
                      <p className="text-[8px] font-black text-gray-300 uppercase">TOTAL</p>
                      <p className="text-sm font-black text-gray-900">{op.totalItens}</p>
                    </div>
                    <div className="bg-emerald-50/30 p-3 rounded-2xl border border-emerald-50 text-center space-y-1">
                      <p className="text-[8px] font-black text-emerald-400 uppercase">SEP.</p>
                      <p className="text-sm font-black text-emerald-600">{op.separados}</p>
                    </div>
                    <div className="bg-red-50/30 p-3 rounded-2xl border border-red-50 text-center space-y-1">
                      <p className="text-[8px] font-black text-red-400 uppercase">FALTA</p>
                      <p className="text-sm font-black text-red-600">{op.faltas}</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <div className="flex justify-between items-end">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Progresso</p>
                      <p className="text-base font-black text-gray-900 leading-none">{op.progresso}%</p>
                    </div>
                    <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                      <div className="h-full bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.3)]" style={{ width: `${op.progresso}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-4 border-t border-gray-50 flex flex-col justify-end">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{op.status.toUpperCase()}</span>
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{new Date(op.data).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => handleStart(op)}
                    className="w-full py-5 bg-[#111827] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-gray-200 active:scale-95 transition-all"
                  >
                    Iniciar Separação
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showLupaModal && lupaItem && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-fadeIn">
          {/* Overlay background */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setShowLupaModal(false); setLupaItem(null); }}
          ></div>

          {/* Side Panel (Drawer) */}
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl border-l border-gray-100 flex flex-col animate-slideInRight">
            <div className="p-8 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter leading-none mb-1 text-emerald-600">Distribuição de Lote</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{lupaItem.codigo}</p>
              </div>
              <button
                onClick={() => { setShowLupaModal(false); setLupaItem(null); }}
                className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center text-lg">🔍</div>
                <p className="text-[9px] font-black text-emerald-700 uppercase leading-relaxed tracking-wider">
                  Distribua as quantidades separadas em cada OP original para garantir a rastreabilidade.
                </p>
              </div>

              <div className="space-y-4">
                {(lupaItem.composicao || []).map((comp: any, idx: number) => (
                  <div key={idx} className="p-6 bg-white border border-gray-100 rounded-2xl hover:border-emerald-200 transition-all group space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center text-[9px] font-black tracking-widest overflow-hidden">
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
                          // If marked as done, auto-fill with max quantity if currently 0
                          if (newComp[idx].concluido && !newComp[idx].qtd_separada) {
                            newComp[idx].qtd_separada = comp.quantidade;
                          }
                          const newItem = { ...lupaItem, composicao: newComp };
                          updateItem(lupaItem.codigo, 'composicao', newComp);
                          setLupaItem(newItem);
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm transition-all ${comp.concluido ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-gray-50 text-gray-300 border border-gray-100 group-hover:bg-white group-hover:border-emerald-100'}`}
                      >
                        {comp.concluido ? '✅' : '○'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                      <div>
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Solicitada</p>
                        <div className="bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-black text-gray-400 border border-transparent">
                          {comp.quantidade}
                        </div>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1.5">Separada (Lupa)</p>
                        <input
                          type="number"
                          className="w-full bg-white border border-emerald-100 px-4 py-2 rounded-xl text-sm font-black text-emerald-600 focus:ring-4 focus:ring-emerald-50 outline-none transition-all"
                          value={comp.qtd_separada || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newComp = [...lupaItem.composicao];
                            newComp[idx] = { ...newComp[idx], qtd_separada: val, concluido: val > 0 };
                            const newItem = { ...lupaItem, composicao: newComp };
                            updateItem(lupaItem.codigo, 'composicao', newComp);
                            setLupaItem(newItem);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 border-t border-gray-100 flex flex-col gap-4">
              <div className="flex justify-between items-center px-2">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total Distribuído</p>
                <p className="text-lg font-black text-emerald-600">
                  {(lupaItem.composicao || []).reduce((sum: number, c: any) => sum + (c.qtd_separada || 0), 0)}
                </p>
              </div>
              <button
                onClick={() => { setShowLupaModal(false); setLupaItem(null); }}
                className="w-full py-5 bg-[#111827] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all"
              >
                Confirmar Distribuição
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Separacao;

