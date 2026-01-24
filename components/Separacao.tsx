
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
    const count = itens.filter(i => i.separado || i.falta).length;
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

    setIsSaving(true);
    const conferenceData = {
      documento: `CC-${selectedOP.opCode}`,
      nome: selectedOP.opCode,
      armazem: selectedOP.armazem,
      ordens: selectedOP.ordens,
      itens: selectedOP.rawItens,
      status: 'Aguardando',
      transf: docTransferencia
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
                    <th className="px-10 py-5 text-center">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedOP.rawItens.map((item, idx) => (
                    <tr key={idx} className={`group ${item.separado ? 'bg-emerald-50/50' : item.falta ? 'bg-red-50/50' : ''}`}>
                      <td className="px-8 py-6">
                        <p className="font-black text-[#111827] text-sm font-mono tracking-tighter">{item.codigo}</p>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">{item.descricao}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">📍 {item.endereco || 'S/E'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center text-lg font-black text-gray-900">{item.quantidade}</td>
                      <td className="px-10 py-6">
                        <div className="flex justify-center gap-3">
                          <button onClick={() => updateItem(item.codigo, 'separado', !item.separado)} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${item.separado ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50'}`}>PICK</button>
                          <button onClick={() => updateItem(item.codigo, 'falta', !item.falta)} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${item.falta ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white border border-gray-200 text-red-600 hover:bg-red-50'}`}>OUT</button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
};

export default Separacao;
