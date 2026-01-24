
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import Loading from './Loading';
import * as XLSX from 'xlsx';


interface TEAItem {
  id: string;
  documento: string; // Ordem Produção
  armazem?: string;
  produto?: string;
  descricao?: string;
  quantidade?: number;
  prioridade?: string;
  status_atual?: string;
  ultima_atualizacao?: string;
  itens: any[]; // Fluxo de status
}

const MatrizFilial: React.FC<{ user: User }> = ({ user }) => {
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
      .order('id', { ascending: false });

    if (error) {
      console.error(error);
    } else if (data) {
      const formattedData = data.map((item: any) => {
        const itensArr = Array.isArray(item.itens) ? item.itens : [];
        const firstItem = itensArr[0] || {};
        return {
          ...item,
          produto: firstItem.produto || item.produto || 'PA00000000000',
          descricao: firstItem.descricao || item.descricao || 'DESCRIÇÃO NÃO CADASTRADA',
          quantidade: firstItem.quantidade || item.quantidade || 0,
          prioridade: firstItem.prioridade || item.prioridade || 'Média',
          status_atual: firstItem.status_atual || item.status_atual || 'Aguardando',
          ultima_atualizacao: item.updated_at || item.data_finalizacao || item.data_conferencia || new Date().toISOString(),
          itens: itensArr
        };
      }).sort((a: any, b: any) => a.documento.localeCompare(b.documento));
      setHistory(formattedData);
    }


    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    const channel = supabase.channel('historico-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistory)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

        // Mapeamento: A=OP, B=Produto, C=Descricao, H=Qtd
        const teaData = data.slice(2).filter(row => row[0]).map(row => ({
          documento: String(row[0]).trim(),
          nome: String(row[0]).trim(),
          armazem: 'MATRIZ',
          itens: [{
            status: 'Matriz',
            icon: '🏢',
            data: new Date().toLocaleDateString('pt-BR'),
            produto: String(row[1] || '').trim(),
            descricao: String(row[2] || '').trim(),
            quantidade: Number(row[7]) || 0,
            prioridade: 'Média',
            status_atual: 'Aguardando Separação...'
          }],
          status_atual: 'Aguardando Separação...'
        }));

        await upsertBatched('historico', teaData, 900);
        alert(`${teaData.length} OPs importadas individualmente para TEA!`);
        fetchHistory();
      } catch (error: any) {
        alert('Erro ao importar Excel: ' + error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Deseja excluir este rastreio?')) return;
    const { error } = await supabase.from('historico').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchHistory();
  };

  const updateStatus = async (item: TEAItem, nextStep: string, icon: string, label: string) => {
    const newFluxo = [...item.itens, {
      status: nextStep,
      icon,
      data: new Date().toLocaleDateString('pt-BR')
    }];

    const { error } = await supabase
      .from('historico')
      .update({
        itens: newFluxo,
        status_atual: label,
        data_finalizacao: nextStep === 'Finalizado' ? new Date().toISOString() : null
      })
      .eq('id', item.id);

    if (error) alert('Erro: ' + error.message);
    else fetchHistory();
  };

  const getStatusBadge = (fluxo: any[]) => {
    const last = fluxo[fluxo.length - 1]?.status;
    if (last === 'Qualidade') return { label: 'Em Qualidade', color: 'bg-amber-100 text-amber-800', icon: '🔍', next: 'Endereçar', nextIcon: '📍', labelNext: 'Endereçar' };
    if (last === 'Endereçar') return { label: 'Endereçando', color: 'bg-blue-100 text-blue-800', icon: '📍', next: 'Transito', nextIcon: '🚚', labelNext: 'Em Trânsito' };
    if (last === 'Transito') return { label: 'Em Trânsito', color: 'bg-indigo-100 text-indigo-800', icon: '🚚', next: 'Finalizado', nextIcon: '✅', labelNext: 'Finalizar' };
    if (last === 'Finalizado') return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-800', icon: '✅', next: null };
    return { label: 'Em Separação', color: 'bg-gray-100 text-gray-800', icon: '📦', next: null };
  };

  const filteredHistory = history.filter(h =>
    h.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.produto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fadeIn pb-20 bg-gray-50 -m-8 p-8 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2rem] border shadow-sm">
        <div className="flex gap-8 items-center">
          <div className="p-4 bg-blue-50 rounded-2xl">
            <span className="text-2xl">🏢</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 uppercase">Receber Matriz</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Importar novas OPs via TEA</p>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
            <button onClick={() => fileInputRef.current?.click()} className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest active:scale-95 shadow-lg shadow-blue-100">
              {isImporting ? 'IMPORTANDO...' : 'Carregar Excel TEA'}
            </button>
          </div>
        </div>

        <div className="flex gap-8 items-center border-l pl-8">
          <div className="p-4 bg-gray-50 rounded-2xl">
            <span className="text-2xl">🕒</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 uppercase">Rastreio Fluxo</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Histórico completo TEA</p>
            <button onClick={() => { }} className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest active:scale-95">Ver Fluxo</button>
          </div>
        </div>

        <div className="flex-1 max-w-sm">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="BUSCAR OP, PRODUTO OU DESCRIÇÃO..." className="w-full pl-10 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-[9px] font-black uppercase focus:ring-2 focus:ring-blue-50 outline-none transition-all shadow-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          <div className="col-span-full">
            <Loading message="Sincronizando Matriz x Filial..." />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4">
            <p className="text-xs font-black text-gray-200 uppercase tracking-[0.4em]">Nenhum registro encontrado</p>
          </div>
        ) : (
          filteredHistory.map((item, index) => {
            const badge = getStatusBadge(item.itens);
            const isCompleted = item.status_atual === 'CONCLUÍDO' || badge.label === 'Concluído';

            return (
              <div key={item.id} className="bg-white rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-between h-[28rem] shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
                <div className="space-y-4 relative z-10">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-gray-400">ID {(index + 1).toString().padStart(2, '0')}</span>
                      <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${badge.color}`}>
                        <span>{badge.icon}</span> {badge.label}
                      </div>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-gray-300 hover:text-red-500 font-black text-xs transition-colors">✕</button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-black text-gray-900">OP: {item.documento}</p>
                    <p className="text-[10px] font-black text-blue-600 font-mono tracking-tighter truncate">{item.produto}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase leading-snug line-clamp-2 h-8">{item.descricao}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-y py-3">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-gray-300 uppercase">Qtd Sol.</p>
                      <p className="text-xs font-black text-gray-800">{item.quantidade}</p>
                    </div>
                    <div className="space-y-1 border-l pl-4">
                      <p className="text-[8px] font-black text-gray-300 uppercase">Prioridade</p>
                      <p className="text-xs font-black text-gray-800">{item.prioridade}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[8px] font-bold text-gray-400 uppercase">
                      <span>🔄</span>
                      <span>Atualizado: {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{item.status_atual}</p>
                  </div>
                </div>

                <div className="relative z-10 pt-4">
                  {isCompleted ? (
                    <div className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[9px] uppercase text-center border border-emerald-100">Finalizado ✅</div>
                  ) : badge.next ? (
                    <button
                      onClick={() => updateStatus(item, badge.next!, badge.nextIcon!, badge.labelNext!)}
                      className="w-full py-3 bg-gray-900 text-white rounded-xl font-black text-[9px] uppercase hover:bg-black active:scale-95 shadow-sm transition-all"
                    >
                      {badge.labelNext}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-3 bg-gray-50 text-gray-300 rounded-xl font-black text-[9px] uppercase cursor-not-allowed"
                    >
                      Aguardando
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MatrizFilial;
