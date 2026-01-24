
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
      transf: docTransferencia
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

  if (isSyncing && ops.length === 0) return <div className="py-20 text-center font-bold">Sincronizando...</div>;

  return (
    <div className="p-4">
      {viewMode === 'detail' && selectedOP ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-500 text-white rounded font-bold"
            >
              VOLTAR
            </button>
            <h2 className="text-2xl font-bold">{selectedOP.opCode}</h2>
            <div className="flex gap-2">
              <input
                value={docTransferencia}
                onChange={e => setDocTransferencia(e.target.value.toUpperCase())}
                placeholder="Nº DOC"
                className="p-2 border rounded font-bold"
              />
              <button
                onClick={handleFinalize}
                className="px-6 py-2 bg-green-600 text-white rounded font-bold"
              >
                FINALIZAR
              </button>
            </div>
          </div>

          <div className="bg-white rounded shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">CÓDIGO / DESCRIÇÃO</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">SOLIC.</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {selectedOP.rawItens.map((item, idx) => (
                  <tr key={idx} className={item.separado ? 'bg-green-50' : item.falta ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{item.codigo}</div>
                      <div className="text-xs text-gray-500">{item.descricao}</div>
                      <div className="text-xs font-bold text-blue-600 mt-1">📍 {item.endereco || 'S/E'}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-bold">{item.quantidade}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => updateItem(item.codigo, 'separado', !item.separado)}
                          className={`px-3 py-1 rounded font-bold text-xs ${item.separado ? 'bg-green-600 text-white' : 'bg-white border'}`}
                        >
                          PICK
                        </button>
                        <button
                          onClick={() => updateItem(item.codigo, 'falta', !item.falta)}
                          className={`px-3 py-1 rounded font-bold text-xs ${item.falta ? 'bg-red-600 text-white' : 'bg-white border'}`}
                        >
                          OUT
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded shadow p-6">
          <h2 className="text-2xl font-bold mb-6">Listas para Separação</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote / OP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Armazém</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progresso</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ops.map(op => (
                <tr key={op.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{op.opCode}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-bold">{op.armazem}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2.5">
                        <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${op.progresso}%` }}></div>
                      </div>
                      <span className="text-xs font-bold">{op.progresso}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleStart(op)}
                      className="px-4 py-1 bg-gray-800 text-white rounded hover:bg-black font-bold text-xs"
                    >
                      ABRIR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Separacao;
