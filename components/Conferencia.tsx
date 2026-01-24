import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';

interface ConferenceItem {
  id: string;
  codigo: string;
  descricao: string;
  qtdSol: number;
  qtdSep: number;
  statusConferencia?: 'ok' | 'falta' | 'pendente';
  opOrigem: string;
}

interface ConferenceMock {
  id: string;
  armazem: string;
  documento: string;
  totalItens: number;
  data: string;
  status: string;
  opsConferidas: string;
  itensOk: string;
  usuarioAtual?: string | null;
  itens: ConferenceItem[];
}


const Conferencia: React.FC<{ user: User }> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [conferences, setConferences] = useState<ConferenceMock[]>([]);
  const [selectedConf, setSelectedConf] = useState<ConferenceMock | null>(null);
  const [showTransferList, setShowTransferList] = useState(false);
  useEffect(() => {
    const fetchConferences = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('conferencia')
        .select('*')
        .order('data_conferencia', { ascending: false });

      if (error) {
        console.error('Erro ao buscar conferências:', error);
      } else if (data) {
        const formattedConfs: ConferenceMock[] = data.map((item: any) => ({
          id: item.id,
          armazem: item.armazem,
          documento: item.documento, // Este é o ID do Lote
          totalItens: item.itens?.length || 0,
          data: item.data_conferencia,
          status: item.status,
          opsConferidas: item.ops_conferidas || '0/0',
          itensOk: item.itens_ok || '0/0', // Será calculado dinamicamente no detalhe
          usuarioAtual: item.responsavel_conferencia,
          itens: item.itens || [],
          // Campo novo ajustado
          docTransferencia: item.transferencia || ''
        }));
        setConferences(formattedConfs);
      }
      setIsSyncing(false);
    };

    fetchConferences();

    const channel = supabase
      .channel('schema-db-changes-conf')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conferencia' },
        (payload) => {
          fetchConferences();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const currentResponsavel = user.nome;

  const handleStart = async (conf: ConferenceMock) => {
    if (conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel) {
      alert(`⚠️ BLOQUEIO CRÍTICO: O card está sendo conferido por "${conf.usuarioAtual}".`);
      return;
    }

    // EXPANSÃO POR OP: Explodir o lote em linhas individuais por OP
    const explodedItens: ConferenceItem[] = [];
    conf.itens.forEach((item: any) => {
      if (item.composicao && item.composicao.length > 0) {
        item.composicao.forEach((comp: any) => {
          explodedItens.push({
            id: `${item.codigo}-${comp.op}`,
            codigo: item.codigo,
            descricao: item.descricao,
            qtdSol: comp.quantidade,
            qtdSep: comp.quantidade, // Assume o que foi separado inicialmente
            statusConferencia: 'pendente',
            opOrigem: comp.op
          });
        });
      } else {
        explodedItens.push({ ...item, statusConferencia: 'pendente' });
      }
    });

    const { error } = await supabase
      .from('conferencia')
      .update({ responsavel_conferencia: currentResponsavel, itens: explodedItens })
      .eq('id', conf.id);

    if (error) {
      alert('Erro ao iniciar conferência: ' + error.message);
      return;
    }

    setSelectedConf({ ...conf, itens: explodedItens, usuarioAtual: currentResponsavel });
    setViewMode('detail');
  };

  const handleBack = async () => {
    if (selectedConf) {
      await supabase
        .from('conferencia')
        .update({ responsavel_conferencia: null })
        .eq('id', selectedConf.id);
    }
    setViewMode('list');
    setSelectedConf(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.role !== 'admin') {
      alert('Acesso Negado: Somente administradores podem excluir registros.');
      return;
    }
    if (confirm('Deseja realmente excluir esta conferência?')) {
      const { error } = await supabase
        .from('conferencia')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        setConferences(prev => prev.filter(c => c.id !== id));
      }
    }
  };

  const getStatusBorder = (status: string) => {
    if (status === 'Aguardando') return 'border-orange-500 ring-4 ring-orange-50';
    if (status === 'Em conferencia') return 'border-blue-500 ring-4 ring-blue-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  const [showSignature, setShowSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const updateItemStatus = (itemId: string, status: 'ok' | 'falta') => {
    if (!selectedConf) return;
    const updatedItens = selectedConf.itens.map(item => {
      if (item.id === itemId) return { ...item, statusConferencia: status };
      return item;
    });
    setSelectedConf({ ...selectedConf, itens: updatedItens });

    if (status === 'falta') {
      const audio = document.getElementById('alarm-sound') as HTMLAudioElement;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.error('Audio play blocked:', e));
      }
    }
  };

  const startDrawing = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
      }
    }
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => setIsDrawing(false);

  const handleSavePending = async () => {
    if (!selectedConf) return;
    const { error } = await supabase
      .from('conferencia')
      .update({ itens: selectedConf.itens })
      .eq('id', selectedConf.id);
    if (error) alert('Erro ao salvar: ' + error.message);
    else alert('Progresso salvo!');
  };

  const handleFinalizeConferencia = async () => {
    if (!selectedConf) return;
    const hasFalta = selectedConf.itens.some(i => i.statusConferencia === 'falta');
    const hasPendente = selectedConf.itens.some(i => i.statusConferencia === 'pendente');

    if (hasFalta) {
      alert('🚨 BLOQUEIO DE SEGURANÇA: Não é possível finalizar com itens em FALTA. Trate a divergência com o supervisor.');
      return;
    }
    if (hasPendente) {
      alert('⚠️ ATENÇÃO: Todos os itens devem ser conferidos (OK) antes de finalizar.');
      return;
    }

    const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
    const signature = canvas ? canvas.toDataURL() : '';

    const { error } = await supabase
      .from('conferencia')
      .update({
        status: 'Historico',
        responsavel_conferencia: null,
        assinatura: signature,
        data_finalizado: new Date().toISOString()
      })
      .eq('id', selectedConf.id);

    if (error) {
      alert('Erro ao finalizar: ' + error.message);
    } else {
      // ATUALIZAÇÃO SISTÊMICA: Marcar como Qualidade no Histórico TEA
      try {
        const uniqueOps = Array.from(new Set(selectedConf.itens.map(i => i.opOrigem)));

        for (const opCode of uniqueOps) {
          const { data: teaRecord } = await supabase
            .from('historico')
            .select('*')
            .eq('op', opCode)
            .single();

          if (teaRecord) {
            const newFluxo = [...(teaRecord.fluxo || []), {
              status: 'Qualidade',
              icon: '🔬',
              data: new Date().toLocaleDateString('pt-BR')
            }];

            await supabase
              .from('historico')
              .update({ fluxo: newFluxo })
              .eq('id', teaRecord.id);
          }
        }
      } catch (err) {
        console.error('Erro ao sincronizar com TEA:', err);
      }

      alert('📦 Conferência Finalizada! Ordem enviada para o Histórico e TEA atualizado.');
      setViewMode('list');
      setSelectedConf(null);
      setShowSignature(false);
    }
  };

  if (isSyncing && conferences.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse tracking-[0.15em]">Sincronizando Conferência...</p>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedConf) {
    return (
      <div className="space-y-6 animate-fadeIn pb-32 relative">
        {/* Alarme Sonoro de Divergência */}
        <audio id="alarm-sound" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto"></audio>

        {/* Modal Assinatura Digital */}
        {showSignature && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-6">
            <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden p-10 flex flex-col items-center">
              <h3 className="text-xl font-black uppercase mb-2">Protocolo de Segurança</h3>
              <p className="text-xs font-bold text-gray-400 uppercase mb-8">Assine abaixo para autenticar a conferência</p>

              <div className="w-full h-64 bg-gray-50 border-4 border-dashed border-gray-200 rounded-[2rem] relative mb-8 overflow-hidden">
                <canvas
                  id="signature-pad"
                  className="w-full h-full cursor-crosshair"
                  onMouseDown={(e) => startDrawing(e)}
                  onMouseMove={(e) => draw(e)}
                  onMouseUp={() => stopDrawing()}
                ></canvas>
              </div>

              <div className="flex gap-4 w-full">
                <button
                  onClick={() => setShowSignature(false)}
                  className="flex-1 py-5 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-xs"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalizeConferencia}
                  className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-emerald-100"
                >
                  Confirmar e Finalizar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Lista de Transferência (Cross-check) */}
        {showTransferList && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl animate-scaleIn overflow-hidden border border-gray-100">
              <div className="bg-[#003B27] p-8 flex justify-between items-center text-white">
                <div>
                  <h3 className="text-xl font-black uppercase flex items-center gap-3">📋 Check Cruzado (Transferência)</h3>
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-1">Validação de volume físico total</p>
                </div>
                <button onClick={() => setShowTransferList(false)} className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all text-sm">✕</button>
              </div>
              <div className="p-8 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 gap-3">
                  {Object.values(
                    selectedConf.itens.reduce((acc: any, item) => {
                      if (!acc[item.codigo]) acc[item.codigo] = { ...item, total: 0 };
                      acc[item.codigo].total += item.qtdSep;
                      return acc;
                    }, {})
                  ).map((group: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-6 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-black text-gray-300 border border-gray-100 shadow-sm">{idx + 1}</div>
                        <div>
                          <p className="font-mono text-sm font-black text-gray-900">{group.codigo}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">{group.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-10">
                        <div className="text-center">
                          <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Total Físico</p>
                          <p className="text-xl font-black text-emerald-600">{group.total} <span className="text-xs text-gray-400">PC</span></p>
                        </div>
                        <input type="checkbox" className="w-8 h-8 rounded-lg border-2 border-gray-200 text-emerald-600 focus:ring-emerald-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 p-8 flex justify-end gap-4 border-t border-gray-100">
                <button onClick={() => setShowTransferList(false)} className="px-12 py-5 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black uppercase text-xs tracking-widest">Fechar</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button onClick={handleBack} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50">← Voltar</button>
        </div>

        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Documento: {selectedConf.documento}</h2>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Local: <span className="text-blue-600 font-extrabold">{selectedConf.armazem}</span> | Conferente: <span className="text-emerald-600 font-extrabold">{selectedConf.usuarioAtual}</span></p>
          </div>
        </div>

        {/* Tabela de Produtos "Explodida" */}
        <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-8 py-6">ORDEM (OP)</th>
                  <th className="px-6 py-6 font-center">PRODUTO</th>
                  <th className="px-6 py-6 text-center">QTD SEP.</th>
                  <th className="px-6 py-6 text-center">CONFERÊNCIA (OK/FLT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedConf.itens.map((item, idx) => (
                  <tr key={idx} className={`hover:bg-gray-50/50 transition-all ${item.statusConferencia === 'falta' ? 'bg-red-50' : item.statusConferencia === 'ok' ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`px-4 py-2 rounded-xl text-[11px] font-black shadow-sm border transition-all ${item.statusConferencia === 'ok' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-gray-900 text-white border-gray-800'}`}>
                          {item.statusConferencia === 'ok' ? '✅' : ''} {item.opOrigem}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <p className="font-mono text-sm font-black text-gray-800 uppercase tracking-tighter">{item.codigo}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase line-clamp-1">{item.descricao}</p>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="text-xl font-black text-gray-400 italic leading-none">{item.qtdSep}</span>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => updateItemStatus(item.id, 'ok')}
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border-2 ${item.statusConferencia === 'ok' ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          <span className="text-xl font-black">OK</span>
                        </button>
                        <button
                          onClick={() => updateItemStatus(item.id, 'falta')}
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border-2 ${item.statusConferencia === 'falta' ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-100' : 'bg-white border-red-100 text-red-600 hover:bg-red-50'}`}
                        >
                          <span className="font-black text-lg">🚨</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-6 pt-12 pb-8">
          <button onClick={handleSavePending} className="px-12 py-6 bg-amber-500 text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl shadow-amber-100 hover:scale-105 transition-all">
            <span className="text-2xl">⏸️</span> Salvar com Pendências
          </button>
          <button onClick={() => setShowTransferList(true)} className="px-12 py-6 bg-blue-600 text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl shadow-blue-100 hover:scale-105 transition-all">
            <span className="text-2xl">📋</span> Lista de Transferência
          </button>
          <button onClick={() => setShowSignature(true)} className="px-12 py-6 bg-emerald-800 text-white rounded-[1.75rem] text-[11px] font-black uppercase flex items-center gap-5 shadow-2xl shadow-emerald-100 hover:scale-105 transition-all">
            <span className="text-2xl">✍️</span> Finalizar Conferência
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {conferences.map(conf => (
        <div key={conf.id} className={`bg-white p-6 rounded-[2rem] border-2 transition-all flex flex-col justify-between h-[26rem] ${getStatusBorder(conf.status)} hover:shadow-2xl relative overflow-hidden`}>
          <div className="space-y-4">
            <span className={`text-[10px] font-black px-4 py-1.5 rounded-full border uppercase tracking-widest ${conf.status === 'Aguardando' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
              {conf.status}
            </span>

            {user.role === 'admin' && (
              <button
                onClick={(e) => handleDelete(conf.id, e)}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all z-20"
                title="Excluir Registro"
              >
                <span className="text-sm font-black">✕</span>
              </button>
            )}

            <div className="space-y-3">
              <h4 className="text-[20px] font-black text-gray-900 uppercase leading-none tracking-tight">OP {conf.id.toString().slice(0, 6)}</h4>
              <div className="space-y-2 text-[10px] font-bold text-gray-500 uppercase">
                <p className="flex items-center gap-2">📍 Armazém: <span className="text-gray-900 font-black">{conf.armazem}</span></p>
                <p className="flex items-center gap-2">📄 Doc: <span className="text-blue-600 font-mono font-black">{conf.documento}</span></p>
                <p className="flex items-center gap-2">👤 Responsável: <span className={`font-black ${conf.usuarioAtual ? 'text-emerald-700' : 'text-gray-400 italic'}`}>{conf.usuarioAtual || 'Disponível'}</span></p>

                <div className="pt-2 mt-2 border-t border-gray-50 space-y-1">
                  <p className="flex items-center justify-between text-gray-400"><span>✅ OPs:</span> <span className="text-gray-800 font-black">{conf.opsConferidas} conferidas</span></p>
                  <p className="flex items-center justify-between text-gray-400"><span>🔍 Itens:</span> <span className="text-gray-800 font-black">{conf.itensOk} OK</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[8px] font-mono font-black text-gray-300 uppercase tracking-widest">{new Date(conf.data).toLocaleString('pt-BR')}</p>
            <button
              onClick={() => handleStart(conf)}
              className={`w-full py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 ${conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-emerald-600 shadow-gray-200'}`}
            >
              {conf.usuarioAtual && conf.usuarioAtual !== currentResponsavel ? `EM USO: ${conf.usuarioAtual}` : 'Abrir Conferência'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Conferencia;
