
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import Loading from './Loading';
import * as XLSX from 'xlsx';
import { useAlert } from './AlertContext';

interface TEAItem {
  id: string;
  documento: string;
  armazem?: string;
  produto?: string;
  descricao?: string;
  quantidade?: number;
  destino?: string;
  status_atual?: string;
  ultima_atualizacao?: string;
  itens: any[];
}



const MatrizFilial: React.FC<{ user: User }> = ({ user }) => {
  const { showAlert } = useAlert();
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<TEAItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('historico')
      .select('*')
      .eq('armazem', 'TEA') // Filtering specifically for TEA records
      .order('id', { ascending: false });

    if (error) {
      console.error(error);
    } else if (data) {
      const formattedData = data.map((item: any) => {
        const itensArr = Array.isArray(item.itens) ? item.itens : [];
        const firstItem = itensArr[0] || {};
        const lastItem = itensArr[itensArr.length - 1] || {};
        return {
          ...item,
          produto: firstItem.produto || item.produto || 'PA00000000000',
          descricao: firstItem.descricao || item.descricao || 'DESCRIÇÃO NÃO CADASTRADA',
          quantidade: firstItem.quantidade || item.quantidade || 0,
          destino: firstItem.destino || item.destino || 'Não Definido',
          status_atual: lastItem.status || item.status_atual || 'Separação',
          ultima_atualizacao: item.updated_at || item.data_finalizacao || new Date().toISOString(),
          itens: itensArr
        };
      }).sort((a: any, b: any) => b.ultima_atualizacao.localeCompare(a.ultima_atualizacao));
      setHistory(formattedData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    const channel = supabase.channel('tea-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistory)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Mapping: A=OP(0), B=Produto(1), C=Descricao(2), H=Qtd(7)
        // Skip header (Assuming it's on Line 2, so data starts at index 2)
        const teaData = data.slice(2).filter(row => row[0]).map(row => ({
          documento: String(row[0]).trim(),
          nome: String(row[0]).trim(),
          armazem: 'TEA',
          itens: [{
            status: 'Separação',
            icon: '📦',
            data: new Date().toLocaleDateString('pt-BR'),
            produto: String(row[1] || '').trim(), // Column B
            descricao: String(row[2] || '').trim(), // Column C
            quantidade: Number(row[7]) || 0, // Column H
            destino: 'Não Definido'
          }]
        }));

        await upsertBatched('historico', teaData, 900);
        showAlert(`${teaData.length} OPs importadas para TEA!`, 'success');
        fetchHistory();
      } catch (error: any) {
        showAlert('Erro ao importar Excel: ' + error.message, 'error');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Deseja excluir este registro de TEA?')) return;
    const { error } = await supabase.from('historico').delete().eq('id', id);
    if (error) showAlert(error.message, 'error');
    else fetchHistory();
  };

  const updateStatus = async (item: TEAItem, nextStep: string) => {
    const statusMap: any = {
      'Separação': { icon: '📦', label: 'EM SEPARAÇÃO', next: 'Conferência' },
      'Conferência': { icon: '🔍', label: 'EM CONFERÊNCIA', next: 'Qualidade' },
      'Qualidade': { icon: '⚖️', label: 'QUALIDADE', next: 'Endereçar' },
      'Endereçar': { icon: '📍', label: 'ENDEREÇAMENTO', next: 'Transito' },
      'Transito': { icon: '🚚', label: 'EM TRÂNSITO', next: 'Finalizar' },
      'Finalizar': { icon: '🏁', label: 'FINALIZAR', next: 'Concluido' },
      'Concluido': { icon: '✅', label: 'CONCLUÍDO', next: null }
    };

    const current = statusMap[nextStep];
    const newFluxo = [...item.itens, {
      status: nextStep,
      icon: current.icon,
      data: new Date().toLocaleDateString('pt-BR')
    }];

    const { error } = await supabase
      .from('historico')
      .update({
        itens: newFluxo,
        status_atual: current.label,
        data_finalizacao: nextStep === 'Concluido' ? new Date().toISOString() : null
      })
      .eq('id', item.id);

    if (error) showAlert('Erro: ' + error.message, 'error');
    else fetchHistory();
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'Separação':
        return { label: 'EM SEPARAÇÃO', color: 'bg-[#EFF6FF] text-[#1E40AF]', icon: '📦', next: null, nextLabel: 'AGUARDANDO', footer: 'AGUARDANDO SEPARAÇÃO...' };
      case 'Conferência':
        return { label: 'EM CONFERÊNCIA', color: 'bg-[#EFF6FF] text-[#1E40AF]', icon: '🔍', next: null, nextLabel: 'AGUARDANDO', footer: 'AGUARDANDO CONFERÊNCIA...' };
      case 'Qualidade':
        return { label: 'QUALIDADE', color: 'bg-[#FEF3C7] text-[#92400E]', icon: '⚖️', next: 'Endereçar', nextLabel: 'PROXIMO', footer: 'AGUARDANDO QUALIDADE...' };
      case 'Endereçar':
        return { label: 'ENDEREÇAMENTO', color: 'bg-[#F5F3FF] text-[#5B21B6]', icon: '📍', next: 'Transito', nextLabel: 'PROXIMO', footer: 'AGUARDANDO ENDEREÇAR...' };
      case 'Transito':
        return { label: 'EM TRÂNSITO', color: 'bg-[#DBEAFE] text-[#1E40AF]', icon: '🚚', next: 'Finalizar', nextLabel: 'PROXIMO', footer: 'AGUARDANDO TRANSITO...' };
      case 'Finalizar':
        return { label: 'FINALIZANDO', color: 'bg-[#F1F5F9] text-[#475569]', icon: '🏁', next: 'Concluido', nextLabel: 'FINALIZAR', footer: 'AGUARDANDO FINALIZAR...' };
      case 'Concluido':
        return { label: 'CONCLUÍDO', color: 'bg-[#F0FDF4] text-[#166534]', icon: '✅', next: null, nextLabel: 'CONCLUÍDO', footer: 'ENTREGA REALIZADA ✅' };
      default:
        return { label: 'AGUARDANDO', color: 'bg-gray-100 text-gray-500', icon: '🕒', next: 'Separação', nextLabel: 'INICIAR', footer: 'AGUARDANDO...' };
    }
  };

  const filteredHistory = history.filter(h =>
    h.status_atual !== 'CONCLUÍDO' &&
    (h.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.produto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.descricao?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn pb-20 bg-gray-50 -m-8 p-8 min-h-screen">
      {/* Header Container */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm text-gray-900">
        <div className="flex gap-6 items-center">
          <div className="w-16 h-16 bg-[#F0F9FF] rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[#111827] uppercase tracking-tight">TEA - Receber Matriz</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Gestão de Transferências entre Armazéns</p>
            <div className="mt-4">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2"
              >
                📜 Histórico TEA
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-md w-full">
          <div className="relative group">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none group-focus-within:text-blue-500 transition-colors">🔍</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="BUSCAR OP, PRODUTO OU DESCRIÇÃO..."
              className="w-full pl-14 pr-6 py-5 bg-gray-50 border-none rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20"><Loading message="Sincronizando Fluxo TEA..." /></div>
        ) : filteredHistory.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4 opacity-30">
            <div className="text-6xl text-gray-900">📥</div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-gray-900">Nenhum registro ativo</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const statusInfo = getStatusDisplay(item.itens[item.itens.length - 1]?.status);

            return (
              <div key={item.id} className="bg-white rounded-[2.5rem] border border-gray-100 p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 group text-gray-900">
                <div className="space-y-6">
                  {/* Card Header */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">OP: {item.documento}</p>
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase shadow-sm ${statusInfo.color}`}>
                        <span>{statusInfo.icon}</span> {statusInfo.label}
                      </div>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-200 hover:text-red-500 hover:bg-red-50 transition-all font-bold">✕</button>
                  </div>

                  {/* Product Info */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-[#2563EB] font-mono tracking-tighter uppercase">{item.produto}</p>
                    <h3 className="text-[14px] font-black text-[#111827] uppercase leading-tight line-clamp-2 h-10 tracking-tight">
                      {item.descricao}
                    </h3>
                  </div>

                  {/* Quantity and Destination Grid */}
                  <div className="bg-[#F8FAFC] rounded-2xl p-5 grid grid-cols-2 gap-4 border border-gray-50 shadow-inner">
                    <div className="text-center space-y-1 text-gray-900">
                      <p className="text-xl font-black text-gray-900 leading-none">{item.quantidade}</p>
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Qtd Sol.</p>
                    </div>
                    <div className="text-center space-y-1 border-l border-gray-200 pl-4 flex flex-col justify-center">
                      <p className="text-[10px] font-black text-gray-900 leading-none truncate uppercase">{item.destino}</p>
                      <p className="text-[8px] font-black text-[#2563EB] uppercase tracking-widest">Destino</p>
                    </div>
                  </div>

                  {/* Footer Timeline Info */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-[9px] font-bold text-gray-300 uppercase tracking-tighter">
                      <span className="text-blue-500">🔄</span>
                      <span>Última atualização: {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-[11px] font-black text-[#10B981] uppercase tracking-widest italic">{statusInfo.footer}</p>
                  </div>
                </div>

                {/* Main Action Button */}
                <div className="pt-8">
                  <button
                    disabled={!statusInfo.next && statusInfo.label !== 'CONCLUÍDO'}
                    onClick={() => statusInfo.next && updateStatus(item, statusInfo.next)}
                    className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${statusInfo.label === 'CONCLUÍDO'
                      ? 'bg-[#F0FDF4] text-[#166534] border border-[#DCFCE7] cursor-default'
                      : !statusInfo.next
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        : 'bg-[#111827] text-white hover:bg-black active:scale-[0.98] shadow-lg shadow-gray-200'
                      }`}
                  >
                    {statusInfo.nextLabel}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showHistoryModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center animate-fadeIn p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}></div>
          <div className="relative bg-white w-full max-w-5xl max-h-[85vh] rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp flex flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-50 pb-6 shrink-0 gap-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Histórico de TEA Finalizados</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apenas transferências com status CONCLUÍDO</p>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
                  <input
                    type="text"
                    placeholder="Filtrar por OP ou Produto..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/10 outline-none"
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all font-bold">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="py-4">OP</th>
                    <th className="py-4">PRODUTO</th>
                    <th className="py-4 text-center">QUANTIDADE</th>
                    <th className="py-4">DESTINO</th>
                    <th className="py-4 text-right">CONCLUÍDO EM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history
                    .filter(h => h.status_atual === 'CONCLUÍDO')
                    .filter(h =>
                      h.documento.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                      h.produto?.toLowerCase().includes(historySearchTerm.toLowerCase())
                    )
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 font-black text-xs">{item.documento}</td>
                        <td className="py-4">
                          <p className="text-[11px] font-bold text-blue-600 font-mono">{item.produto}</p>
                          <p className="text-[9px] font-medium text-gray-400 truncate max-w-[200px] uppercase">{item.descricao}</p>
                        </td>
                        <td className="py-4 text-center font-black text-xs">{item.quantidade}</td>
                        <td className="py-4 font-black text-[10px] text-purple-600 uppercase">{item.destino}</td>
                        <td className="py-4 text-right text-[10px] font-bold text-gray-400">
                          {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  {history.filter(h => h.status_atual === 'CONCLUÍDO').length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs font-black text-gray-300 uppercase tracking-widest">Nenhum registro finalizado</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatrizFilial;
