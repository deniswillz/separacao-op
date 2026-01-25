
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
      // De-duplicação local para garantir que cada OP apareça apenas uma vez (caso existam duplicatas no banco)
      const uniqueMap = new Map();

      data.forEach((item: any) => {
        const doc = item.documento;
        if (!uniqueMap.has(doc)) {
          const itensArr = Array.isArray(item.itens) ? item.itens : [];
          const lastItem = itensArr[itensArr.length - 1] || {};
          const firstItem = itensArr[0] || {};

          const rawStatus = lastItem.status || item.status_atual || 'Separação';
          const normStatus = String(rawStatus).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

          uniqueMap.set(doc, {
            ...item,
            produto: firstItem.produto || item.produto || 'PA0000',
            descricao: firstItem.descricao || item.descricao || 'DESCRIÇÃO...',
            quantidade: firstItem.quantidade || item.quantidade || 0,
            destino: firstItem.destino || item.destino || 'Não Definido',
            status_atual: normStatus,
            ultima_atualizacao: item.updated_at || item.data_finalizacao || new Date().toISOString(),
            itens: itensArr
          });
        }
      });

      const formattedData = Array.from(uniqueMap.values())
        .sort((a: any, b: any) => b.ultima_atualizacao.localeCompare(a.ultima_atualizacao));

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
        data_finalizacao: nextStep === 'Concluido' ? new Date().toISOString() : null
      })
      .eq('id', item.id);

    if (error) showAlert('Erro: ' + error.message, 'error');
    else fetchHistory();
  };

  const revertStatus = async (item: TEAItem) => {
    if (['SEPARACAO', 'CONFERENCIA', 'QUALIDADE'].includes(item.status_atual || '')) {
      showAlert('Não é possível reverter antes desta etapa.', 'warning');
      return;
    }
    if (item.itens.length <= 1) {
      showAlert('Não é possível reverter a situação inicial.', 'warning');
      return;
    }
    const newFluxo = [...item.itens];
    newFluxo.pop();

    const { error } = await supabase
      .from('historico')
      .update({
        itens: newFluxo,
        data_finalizacao: null
      })
      .eq('id', item.id);

    if (error) showAlert('Erro: ' + error.message, 'error');
    else fetchHistory();
  };

  const updateDestino = async (item: TEAItem, newDestino: string) => {
    const newItens = [...item.itens];
    if (newItens[0]) {
      newItens[0] = { ...newItens[0], destino: newDestino };
    }

    const { error } = await supabase
      .from('historico')
      .update({ itens: newItens })
      .eq('id', item.id);

    if (error) showAlert('Erro: ' + error.message, 'error');
    else fetchHistory();
  };

  const getStatusDisplay = (status: string) => {
    const s = String(status || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    switch (s) {
      case 'SEPARACAO':
        return { label: 'EM SEPARAÇÃO', color: 'bg-[#EFF6FF] text-[#1E40AF]', icon: '📦', next: null, nextLabel: 'AGUARDANDO', footer: 'AGUARDANDO SEPARAÇÃO...' };
      case 'CONFERENCIA':
        return { label: 'EM CONFERÊNCIA', color: 'bg-[#EFF6FF] text-[#1E40AF]', icon: '🔍', next: null, nextLabel: 'AGUARDANDO', footer: 'AGUARDANDO CONFERÊNCIA...' };
      case 'QUALIDADE':
        return { label: 'QUALIDADE', color: 'bg-[#FEF3C7] text-[#92400E]', icon: '⚖️', next: 'Endereçar', nextLabel: 'PROXIMO', footer: 'AGUARDANDO QUALIDADE...' };
      case 'ENDERECAR':
        return { label: 'ENDEREÇAMENTO', color: 'bg-[#F5F3FF] text-[#5B21B6]', icon: '📍', next: 'Transito', nextLabel: 'PROXIMO', footer: 'AGUARDANDO ENDEREÇAR...' };
      case 'TRANSITO':
        return { label: 'EM TRÂNSITO', color: 'bg-[#DBEAFE] text-[#1E40AF]', icon: '🚚', next: 'Finalizar', nextLabel: 'PROXIMO', footer: 'AGUARDANDO TRANSITO...' };
      case 'FINALIZAR':
        return { label: 'FINALIZANDO', color: 'bg-[#F1F5F9] text-[#475569]', icon: '🏁', next: 'Concluido', nextLabel: 'FINALIZAR', footer: 'AGUARDANDO FINALIZAR...' };
      case 'CONCLUIDO':
        return { label: 'CONCLUÍDO', color: 'bg-[#F0FDF4] text-[#166534]', icon: '✅', next: null, nextLabel: 'CONCLUÍDO', footer: 'ENTREGA REALIZADA ✅' };
      default:
        return { label: 'AGUARDANDO', color: 'bg-gray-100 text-gray-500', icon: '🕒', next: 'Separação', nextLabel: 'INICIAR', footer: 'AGUARDANDO...' };
    }
  };

  const filteredHistory = history.filter(h =>
    h.status_atual !== 'CONCLUIDO' && // Changed from 'CONCLUÍDO' to 'CONCLUIDO'
    (h.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.produto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.descricao?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn pb-20 bg-[var(--bg-main)] -m-8 p-8 min-h-screen">
      {/* Header Container */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-[var(--bg-secondary)] p-8 rounded-[2.5rem] border border-[var(--border-light)] shadow-sm text-[var(--text-primary)]">
        <div className="flex gap-6 items-center">
          <div className="w-16 h-16 bg-[#F0F9FF] rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight">TEA - Receber Matriz</h1>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none">Gestão de Transferências entre Armazéns</p>
            <div className="mt-4">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="px-6 py-2.5 bg-[var(--text-primary)] text-[var(--bg-secondary)] rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-lg shadow-gray-200/10 hover:opacity-90 transition-all flex items-center gap-2"
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
              className="w-full pl-14 pr-6 py-5 bg-[var(--bg-inner)] border-none rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/10 outline-none transition-all text-[var(--text-primary)]"
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
            <div className="text-6xl text-[var(--text-primary)]">📥</div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-[var(--text-primary)]">Nenhum registro ativo</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const statusInfo = getStatusDisplay(item.itens[item.itens.length - 1]?.status);

            return (
              <div key={item.id} className="bg-[var(--bg-secondary)] rounded-[2.5rem] border border-[var(--border-light)] p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 group text-[var(--text-primary)]">
                <div className="space-y-6">
                  {/* Card Header */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">OP: {item.documento}</p>
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase shadow-sm ${statusInfo.color}`}>
                        <span>{statusInfo.icon}</span> {statusInfo.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!['SEPARACAO', 'CONFERENCIA', 'QUALIDADE'].includes(item.status_atual || '') && (
                        <button
                          onClick={() => revertStatus(item)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-all font-bold"
                          title="Voltar Situação"
                        >
                          ↩️
                        </button>
                      )}
                      <button onClick={() => deleteItem(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all font-bold">✕</button>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#2563EB] font-mono tracking-tighter uppercase">{item.produto}</p>
                    <h3 className="text-base font-black text-[var(--text-primary)] uppercase leading-tight line-clamp-2 h-10 tracking-tight">
                      {item.descricao}
                    </h3>
                  </div>

                  {/* Quantity and Destination Grid */}
                  <div className="bg-[var(--bg-inner)] rounded-2xl p-5 grid grid-cols-2 gap-4 border border-[var(--border-light)] shadow-inner">
                    <div className="text-center space-y-1">
                      <p className="text-xl font-black text-[var(--text-primary)] leading-none">{item.quantidade}</p>
                      <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Qtd Sol.</p>
                    </div>
                    <div className="text-center space-y-1 border-l border-[var(--border-light)] pl-4 flex flex-col justify-center">
                      <select
                        value={item.destino}
                        onChange={(e) => updateDestino(item, e.target.value)}
                        className="bg-transparent text-[10px] font-black text-[var(--text-primary)] leading-none border-none outline-none uppercase cursor-pointer hover:text-blue-500 transition-colors w-full text-center appearance-none"
                      >
                        {['Não Definido', 'Armazém 04', 'Armazém 08', 'Armazém 11', 'Armazém 21', 'Armazém 26', 'Armazém 31', 'Armazém 35', 'Armazém 41', 'Armazém 45', 'Armazém 51'].map(val => (
                          <option key={val} value={val} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">{val}</option>
                        ))}
                      </select>
                      <p className="text-[8px] font-black text-[#2563EB] uppercase tracking-widest">Destino</p>
                    </div>
                  </div>

                  {/* Footer Timeline Info */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tighter">
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
                        ? 'bg-[var(--bg-inner)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-[var(--text-primary)] text-[var(--bg-secondary)] hover:opacity-90 active:scale-[0.98] shadow-lg shadow-gray-200/10'
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
          <div className="relative bg-[var(--bg-secondary)] w-full max-w-5xl max-h-[85vh] rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-slideInUp flex flex-col overflow-hidden text-[var(--text-primary)]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[var(--border-light)] pb-6 shrink-0 gap-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">Histórico de TEA Finalizados</h3>
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Apenas transferências com status CONCLUÍDO</p>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
                  <input
                    type="text"
                    placeholder="Filtrar por OP ou Produto..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-inner)] border-none rounded-xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/10 outline-none text-[var(--text-primary)]"
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="w-10 h-10 bg-[var(--bg-inner)] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-all font-bold">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                  <tr className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-light)]">
                    <th className="py-4">OP</th>
                    <th className="py-4">PRODUTO</th>
                    <th className="py-4 text-center">QUANTIDADE</th>
                    <th className="py-4">DESTINO</th>
                    <th className="py-4 text-right">CONCLUÍDO EM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-light)]">
                  {history
                    .filter(h => h.status_atual === 'CONCLUIDO')
                    .filter(h =>
                      h.documento.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                      h.produto?.toLowerCase().includes(historySearchTerm.toLowerCase())
                    )
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-[var(--bg-inner)]/30 transition-colors">
                        <td className="py-4 font-black text-xs">{item.documento}</td>
                        <td className="py-4">
                          <p className="text-[11px] font-bold text-blue-600 font-mono">{item.produto}</p>
                          <p className="text-[9px] font-medium text-[var(--text-muted)] truncate max-w-[200px] uppercase">{item.descricao}</p>
                        </td>
                        <td className="py-4 text-center font-black text-xs">{item.quantidade}</td>
                        <td className="py-4 font-black text-[10px] text-purple-600 uppercase">{item.destino}</td>
                        <td className="py-4 text-right text-[10px] font-bold text-[var(--text-muted)]">
                          {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  {history.filter(h => h.status_atual === 'CONCLUIDO').length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Nenhum registro finalizado</td>
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
