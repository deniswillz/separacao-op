
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
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
      });
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

        // Mapeamento: A=OP, U=Produto, V=Descricao, W=Qtd (mesmo Excel do Empenhos)
        // Linha 2 é cabeçalho, dados começam na 3 (index 2)
        // Usando apenas colunas que existem no banco: documento, nome, armazem, itens
        const teaData = data.slice(2).filter(row => row[0]).map(row => ({
          documento: String(row[0]).trim(),
          nome: String(row[0]).trim(),
          armazem: 'MATRIZ',
          itens: [{
            status: 'Matriz',
            icon: '🏢',
            data: new Date().toLocaleDateString('pt-BR'),
            produto: String(row[20] || '').trim(),
            descricao: String(row[21] || '').trim(),
            quantidade: Number(row[22]) || 0,
            prioridade: 'Média',
            status_atual: 'Aguardando Separação...'
          }]
        }));



        await upsertBatched('historico', teaData, 500);
        alert(`${teaData.length} OPs importadas para TEA!`);
        fetchHistory();
      } catch (error: any) {
        alert('Erro ao importar Excel: ' + error.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
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
        data_finalizacao: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) alert('Erro: ' + error.message);
    else fetchHistory();
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Deseja excluir este rastreio?')) return;
    const { error } = await supabase.from('historico').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchHistory();
  };

  const getStatusBadge = (fluxo: any[]) => {
    const last = fluxo[fluxo.length - 1]?.status;
    if (last === 'Separação') return { label: 'Em Separação', color: 'bg-blue-100 text-blue-800', icon: '📦' };
    if (last === 'Conferência' || last === 'Qualidade') return { label: 'Em Conferência', color: 'bg-indigo-100 text-indigo-800', icon: '🔍' };
    if (last === 'transito' || last === 'Em Transito') return { label: 'Em Trânsito', color: 'bg-blue-100 text-blue-800', icon: '🚚' };
    if (last === 'Recebido') return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-800', icon: '✅' };
    return { label: 'Aguardando', color: 'bg-gray-100 text-gray-800', icon: '⏳' };
  };

  const filteredHistory = history.filter(h =>
    h.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.produto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fadeIn pb-20 bg-gray-50 -m-8 p-8 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2rem] border shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 uppercase">Matriz x Filial</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Sincronização Integrada TEA</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-lg shadow-blue-100">
            {isImporting ? 'IMPORTANDO...' : 'Importar Matriz'}
          </button>
          <div className="relative flex-1 md:w-64">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="BUSCAR OP..." className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent rounded-xl text-[10px] font-black uppercase focus:bg-white focus:ring-2 focus:ring-blue-50 outline-none transition-all" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredHistory.map((item) => {
          const badge = getStatusBadge(item.itens);
          const isQualidade = item.status_atual?.includes('Qualidade') || item.itens.some(i => i.status === 'Qualidade');
          const isConcuidado = item.status_atual === 'CONCLUÍDO';

          return (
            <div key={item.id} className="bg-white rounded-[2.5rem] border p-8 flex flex-col justify-between h-[30rem] shadow-sm hover:shadow-xl transition-all relative group overflow-hidden">
              <div className="space-y-5 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[11px] font-black text-gray-900">OP: {item.documento}</p>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase ${badge.color}`}>
                      <span>{badge.icon}</span> {badge.label}
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">✕</button>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-black text-blue-600 font-mono tracking-tighter">{item.produto}</p>
                  <p className="text-[11px] font-bold text-gray-400 uppercase leading-snug line-clamp-3 h-12">{item.descricao}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 border-y py-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-300 uppercase">Qtd Sol.</p>
                    <p className="text-sm font-black text-gray-800">{item.quantidade}</p>
                  </div>
                  <div className="space-y-1 border-l pl-4">
                    <p className="text-[9px] font-black text-gray-300 uppercase">Prioridade</p>
                    <p className="text-sm font-black text-gray-800">{item.prioridade}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🔄</span>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Última atualização: {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}</p>
                  </div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{item.status_atual}</p>
                </div>
              </div>

              <div className="relative z-10">
                {isConcuidado ? (
                  <div className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase text-center border border-emerald-100">Finalizado ✅</div>
                ) : (
                  <button
                    disabled={!isQualidade}
                    onClick={() => updateStatus(item, 'Recebido', '🏁', 'CONCLUÍDO')}
                    className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase transition-all ${isQualidade ? 'bg-gray-900 text-white hover:bg-black active:scale-95 shadow-xl shadow-gray-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                  >
                    {isQualidade ? 'Confirmar Recebimento' : 'Aguardando Qualidade...'}
                  </button>
                )}
              </div>

              <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50 rounded-bl-full z-0 group-hover:bg-blue-50/50 transition-colors"></div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MatrizFilial;
