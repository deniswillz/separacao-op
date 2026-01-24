
import React, { useState, useEffect } from 'react';
import { User } from '../types';
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


const Conferencia: React.FC<{ user: User }> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [items, setItems] = useState<ConfItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConfItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('conferencia').select('*').order('data_conferencia', { ascending: false });
    if (error) console.error(error);
    else if (data) setItems(data);
    setIsLoading(false);
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

  const handleToggleCheck = (sku: string, op: string, field: 'ok' | 'falta') => {
    if (!selectedItem) return;
    const newItens = selectedItem.itens.map(item => {
      if (item.codigo === sku && item.op === op) {
        if (field === 'falta' && !item.falta) {
          // Play alarm sound (placeholder)
          console.log('🚨 ALARME: Divergência detectada!');
        }
        return { ...item, ok: field === 'ok' ? !item.ok : false, falta: field === 'falta' ? !item.falta : false };
      }
      return item;
    });
    setSelectedItem({ ...selectedItem, itens: newItens });
  };

  const handleFinalize = async () => {
    if (!selectedItem) return;

    const hasFalta = selectedItem.itens.some(i => i.falta);
    if (hasFalta) {
      alert('🚨 Não é possível finalizar com itens em FALTA. Use "Salvar com Pendências".');
      return;
    }

    const allChecked = selectedItem.itens.every(i => i.ok);
    if (!allChecked) {
      alert('⚠️ Verifique todos os itens antes de finalizar.');
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

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <tr>
                      <th className="px-8 py-5">PRODUTO / OP</th>
                      <th className="px-6 py-5 text-center">SEPARADO</th>
                      <th className="px-6 py-5 text-center">CONFERIDO</th>
                      <th className="px-10 py-5 text-center">AÇÃO RÁPIDA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedItem.itens.map((item, idx) => (
                      <tr key={idx} className={`group transition-all ${item.ok ? 'bg-emerald-50/30' : item.falta ? 'bg-red-50/30' : ''}`}>
                        <td className="px-8 py-6">
                          <p className="text-xs font-black text-gray-900 font-mono">{item.codigo}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase truncate max-w-xs">{item.descricao}</p>
                          <p className="text-[9px] font-black text-blue-600 mt-1">OP: {item.op}</p>
                        </td>
                        <td className="px-6 py-6 text-center text-sm font-black text-gray-400">
                          {item.quantidade}
                        </td>
                        <td className="px-6 py-6 text-center text-sm font-black text-gray-900">
                          {item.ok ? item.quantidade : 0}
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleToggleCheck(item.codigo, item.op, 'ok')}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${item.ok ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                            >
                              OK
                            </button>
                            <button
                              onClick={() => handleToggleCheck(item.codigo, item.op, 'falta')}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${item.falta ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'}`}
                            >
                              FALTA
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo da Conferência</h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[9px] font-black text-emerald-600 uppercase">Progresso Geral</p>
                    <p className="text-2xl font-black text-gray-900">{Math.round((selectedItem.itens.filter(i => i.ok).length / selectedItem.itens.length) * 100)}%</p>
                  </div>
                  <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(selectedItem.itens.filter(i => i.ok).length / selectedItem.itens.length) * 100}%` }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                  <div className="bg-emerald-50 p-4 rounded-2xl flex justify-between items-center">
                    <p className="text-[10px] font-black text-emerald-600 uppercase">Itens OK</p>
                    <p className="text-xl font-black text-emerald-700">{selectedItem.itens.filter(i => i.ok).length}</p>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-2xl flex justify-between items-center">
                    <p className="text-[10px] font-black text-amber-600 uppercase">Divergências</p>
                    <p className="text-xl font-black text-amber-700">{selectedItem.itens.filter(i => i.falta).length}</p>
                  </div>
                </div>

                <button
                  onClick={handleFinalize}
                  className="w-full py-5 bg-[#006B47] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-[#004D33] active:scale-95 transition-all mt-4"
                >
                  Finalizar e Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {items.map((item) => {
            const isAguardando = item.status === 'Aguardando' || !item.responsavel_conferencia;
            const isEmUso = item.responsavel_conferencia && item.responsavel_conferencia !== user.nome;

            return (
              <div key={item.id} className="bg-white rounded-[2.5rem] border border-gray-100 p-10 space-y-8 flex flex-col justify-between hover:shadow-2xl hover:translate-y-[-8px] transition-all duration-500 group relative overflow-hidden h-[34rem]">
                <div className="space-y-8 relative z-10">
                  <div className="flex justify-start">
                    <span className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${isAguardando ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                      {isAguardando ? 'AGUARDANDO' : 'EM CONFERENCIA'}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-3xl font-black text-[#111827] tracking-tighter uppercase leading-none">OP {item.nome || item.documento}</h3>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base">📍</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Armazém: <span className="text-gray-900">{item.armazem}</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base">📋</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">DOC: <span className="text-blue-600 font-mono italic">{item.itens?.[0]?.doc_transferencia || 'S/N'}</span></p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-base">👤</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Responsável: <span className={item.responsavel_conferencia ? 'text-emerald-600' : 'text-gray-300 italic'}>{item.responsavel_conferencia || 'DISPONÍVEL'}</span></p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-base">✅</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">OPS: <span className="text-gray-900">0/{item.ordens?.length || 1} CONFERIDAS</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base">🔍</span>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">ITENS: <span className="text-gray-900">0/{item.itens?.length || 0} OK</span></p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-4 flex flex-col justify-end">
                  <p className="text-[8px] font-black text-gray-200 uppercase tracking-widest mb-4">{item.data_conferencia}</p>
                  {isEmUso ? (
                    <div className="w-full py-5 bg-gray-50 text-gray-400 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-center">
                      Em uso: {item.responsavel_conferencia}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpen(item)}
                      className="w-full py-5 bg-[#111827] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-gray-200 active:scale-95 transition-all"
                    >
                      Abrir Conferência
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Conferencia;
