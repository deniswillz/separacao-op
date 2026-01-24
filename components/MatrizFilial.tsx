
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import * as XLSX from 'xlsx';

interface TEAItem {
  id: string;
  documento: string; // OP
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
  const [showHistory, setShowHistory] = useState(false);
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
      // Mapeamento para garantir que os campos necessários existam
      const formattedData = data.map((item: any) => ({
        ...item,
        produto: item.produto || 'PA00000000000',
        descricao: item.descricao || 'DESCRIÇÃO NÃO CADASTRADA',
        quantidade: item.quantidade || 0,
        prioridade: item.prioridade || 'Média',
        status_atual: item.status_atual || 'Aguardando',
        ultima_atualizacao: item.data_finalizacao || item.data_conferencia || new Date().toISOString(),
        itens: Array.isArray(item.itens) ? item.itens : []
      }));
      setHistory(formattedData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
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

        // Mapeamento conforme imagem (A=OP, B=Produto, C=Descricao, H=Qtd)
        // Linha 2 é cabeçalho, dados começam na 3 (index 2)
        const teaData = data.slice(2).filter(row => row[0]).map(row => ({
          documento: String(row[0]).trim(),
          produto: String(row[1] || '').trim(),
          descricao: String(row[2] || '').trim(),
          quantidade: Number(row[7]) || 0,
          prioridade: 'Média',
          armazem: 'MATRIZ',
          status_atual: 'Aguardando Separação...',
          itens: [
            { status: 'Matriz', icon: '🏢', data: new Date().toLocaleDateString('pt-BR') }
          ]
        }));

        await upsertBatched('historico', teaData, 500);
        alert('Movimentações TEA sincronizadas com sucesso!');
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

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
    } else {
      fetchHistory();
    }
  };

  const getStatusBadge = (fluxo: any[]) => {
    const lastStatus = fluxo[fluxo.length - 1]?.status;
    if (lastStatus === 'Separação') return { label: 'EM SEPARAÇÃO', color: 'bg-blue-50 text-blue-600', icon: '📄' };
    if (lastStatus === 'Conferência' || lastStatus === 'Qualidade') return { label: 'EM CONFERÊNCIA', color: 'bg-indigo-50 text-indigo-600', icon: '🔍' };
    if (lastStatus === 'Em Transito') return { label: 'EM TRÂNSITO', color: 'bg-blue-50 text-blue-600', icon: '🚚' };
    return { label: 'AGUARDANDO', color: 'bg-gray-50 text-gray-500', icon: '⏳' };
  };

  const filteredHistory = history.filter(h =>
    h.documento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.produto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest animate-pulse">Carregando Painel TEA...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fadeIn pb-20 bg-[#F8FAFC] -m-8 p-8 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">TEA</p>
        <h1 className="text-4xl font-extrabold text-[#111827] tracking-tight uppercase">Integração TEA</h1>
        <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest mt-1 opacity-70">Sincronização entre Matriz e Filial</p>
      </div>

      {/* Action Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm flex items-center gap-8 group hover:shadow-xl transition-all duration-500">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">📥</div>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 uppercase">Receber Matriz</h3>
              <p className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Importar/Sincronizar TEA</p>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-8 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
            >
              {isImporting ? 'PROCESSANDO...' : 'Carregar Excel'}
            </button>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm flex items-center gap-8 group hover:shadow-xl transition-all duration-500">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">🕒</div>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 uppercase">Rastreio Fluxo</h3>
              <p className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Histórico Completo TEA</p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-8 py-3.5 bg-[#111827] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-lg shadow-gray-200 active:scale-95"
            >
              Ver Fluxo
            </button>
          </div>
        </div>
      </div>

      {/* Transfer List Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Lista de Transferência</h2>
        <div className="relative w-full max-w-lg">
          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
          <input
            type="text"
            placeholder="BUSCAR OP, PRODUTO OU DESCRIÇÃO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-50 rounded-[2rem] py-4 pl-14 pr-8 text-xs font-bold text-gray-500 placeholder-gray-300 outline-none focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Grid of Transfer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredHistory.map((item) => {
          const badge = getStatusBadge(item.itens);
          return (
            <div key={item.id} className="bg-white rounded-[3rem] border border-gray-50 shadow-sm p-8 space-y-6 flex flex-col justify-between hover:shadow-2xl hover:translate-y-[-8px] transition-all duration-500 relative group overflow-hidden">
              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">OP: {item.documento}</p>
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${badge.color}`}>
                      <span>{badge.icon}</span> {badge.label}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-left">
                  <p className="text-[11px] font-black text-blue-600 font-mono tracking-tighter">{item.produto}</p>
                  <h4 className="text-sm font-black text-gray-800 uppercase leading-snug line-clamp-2 h-10">{item.descricao}</h4>
                </div>

                <div className="bg-gray-50/50 rounded-[2rem] p-6 grid grid-cols-2 gap-4 border border-gray-50">
                  <div className="space-y-1 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase">Qtd Sol.</p>
                    <p className="text-xl font-black text-gray-900">{item.quantidade}</p>
                  </div>
                  <div className="space-y-1 text-center border-l border-gray-100">
                    <p className="text-[9px] font-black text-gray-400 uppercase">Prioridade</p>
                    <p className={`text-[11px] font-black uppercase ${item.prioridade?.toLowerCase().includes('urg') ? 'text-red-500' : 'text-blue-500'}`}>
                      {item.prioridade}
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-md bg-blue-100 flex items-center justify-center text-[7px] font-black text-blue-600">🕒</div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Última atualização: {new Date(item.ultima_atualizacao!).toLocaleString('pt-BR')}</p>
                  </div>
                  <p className="text-xs font-black text-emerald-600 uppercase mt-2 tracking-widest">{item.status_atual}</p>
                </div>
              </div>

              <div className="mt-8 relative z-10">
                {badge.label === 'EM TRÂNSITO' ? (
                  <button
                    onClick={() => updateStatus(item, 'Recebido', '🏁', 'CONCLUÍDO')}
                    className="w-full py-5 bg-[#111827] text-emerald-400 rounded-[1.75rem] font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95 border border-emerald-900/30"
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-5 bg-[#111827] text-red-500/80 rounded-[1.75rem] font-black text-[11px] uppercase tracking-widest opacity-90 cursor-default border border-red-900/10"
                  >
                    Aguardando
                  </button>
                )}
              </div>

              {/* Design decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-[100%] z-0 group-hover:bg-blue-50 transition-colors duration-500"></div>
            </div>
          );
        })}
      </div>

      {filteredHistory.length === 0 && (
        <div className="py-32 text-center space-y-4">
          <div className="text-6xl opacity-20">🚚</div>
          <p className="text-sm font-black text-gray-300 uppercase tracking-[0.3em]">Nenhuma transferência encontrada</p>
        </div>
      )}
    </div>
  );
};

export default MatrizFilial;
