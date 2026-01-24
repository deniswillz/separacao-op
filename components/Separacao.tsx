
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
      setOps(data.map((item: any) => ({
        id: item.id,
        opCode: item.nome || item.documento,
        armazem: item.armazem,
        ordens: item.ordens || [],
        totalItens: item.itens?.length || 0,
        data: item.data_criacao,
        progresso: calculateProgress(item.itens),
        urgencia: item.urgencia || 'media',
        status: item.status,
        usuarioAtual: item.usuario_atual,
        rawItens: item.itens || []
      })));
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

  const updateItem = (itemCodigo: string, field: string, value: any) => {
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
      transf: docTransferencia // Tentando 'transf' conforme logs de erro 400
    };

    try {
      const { error: confErr } = await supabase.from('conferencia').insert([conferenceData]);
      if (confErr) throw confErr;

      await supabase.from('separacao').delete().eq('id', selectedOP.id);

      // Update TEA status
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

  if (isSyncing && ops.length === 0) return <div className="py-20 text-center text-xs font-black uppercase text-gray-400">Sincronizando...</div>;

  return (
    <div className="space-y-6">
      {viewMode === 'detail' && selectedOP ? (
        <div className="space-y-6 animate-fadeIn pb-20">
          <button onClick={handleBack} className="px-6 py-2 bg-white border rounded-xl text-[10px] font-black uppercase">← Voltar</button>
          <div className="bg-white rounded-3xl border shadow-sm h-full flex flex-col">
            <div className="p-8 border-b bg-gray-50/50 flex justify-between items-center">
              <h2 className="text-xl font-black">{selectedOP.opCode}</h2>
              <input value={docTransferencia} onChange={e => setDocTransferencia(e.target.value.toUpperCase())} placeholder="Nº DOC TRANSFERÊNCIA" className="px-6 py-3 border rounded-xl font-black text-xs uppercase" />
            </div>
            <table className="w-full text-left">
              <thead className="bg-[#111827] text-[10px] font-black text-white uppercase tracking-widest">
                <tr><th className="px-8 py-5">CÓDIGO / DESCRIÇÃO</th><th className="px-6 py-5 text-center">SOLIC.</th><th className="px-6 py-5 text-center">AÇÕES</th></tr>
              </thead>
              <tbody className="divide-y text-xs font-bold text-gray-700">
                {selectedOP.rawItens.map((item, idx) => (
                  <tr key={idx} className={item.separado ? 'bg-emerald-50' : item.falta ? 'bg-red-50' : ''}>
                    <td className="px-8 py-5">
                      <p className="font-black text-gray-900">{item.codigo}</p>
                      <p className="text-[10px] text-gray-400 uppercase">{item.descricao}</p>
                      <p className="text-[10px] font-black text-emerald-600 mt-1">📍 {item.endereco || 'S/E'}</p>
                    </td>
                    <td className="px-6 py-5 text-center text-base font-black">{item.quantidade}</td>
                    <td className="px-6 py-5">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => updateItem(item.codigo, 'separado', !item.separado)} className={`px-4 py-2 rounded-xl text-[9px] font-black border ${item.separado ? 'bg-emerald-600 text-white' : 'bg-white'}`}>PICK</button>
                        <button onClick={() => updateItem(item.codigo, 'falta', !item.falta)} className={`px-4 py-2 rounded-xl text-[9px] font-black border ${item.falta ? 'bg-red-600 text-white' : 'bg-white'}`}>OUT</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-8 bg-gray-50 border-t flex justify-center">
              <button onClick={handleFinalize} disabled={isSaving} className="px-12 py-4 bg-emerald-800 text-white rounded-2xl font-black text-xs shadow-xl active:scale-95 uppercase">Finalizar Separação</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#111827] text-[10px] font-black text-white uppercase tracking-widest">
              <tr><th className="px-8 py-6">OP / LOTE</th><th className="px-6 py-6">ARMAZÉM</th><th className="px-6 py-6">ITENS</th><th className="px-6 py-6 text-center">AÇÃO</th></tr>
            </thead>
            <tbody className="divide-y text-xs font-bold text-gray-700">
              {ops.map(op => (
                <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-6">
                    <p className="font-black text-gray-900">{op.opCode}</p>
                    <p className="text-[9px] text-gray-400">{new Date(op.data).toLocaleDateString()}</p>
                  </td>
                  <td className="px-6 py-6 font-black text-blue-600 uppercase">{op.armazem}</td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${op.progresso}%` }}></div></div>
                      <span className="text-[10px]">{op.progresso}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <button onClick={() => handleStart(op)} className="px-6 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-gray-200">Abrir</button>
                  </td>
                </tr>
              ))}
              {ops.length === 0 && (<tr><td colSpan={4} className="px-6 py-20 text-center text-gray-300 uppercase font-black">Nenhum lote pendente</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Separacao;
