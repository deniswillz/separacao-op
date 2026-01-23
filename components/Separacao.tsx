
import React, { useState, useEffect } from 'react';
import { UrgencyLevel } from '../types';
import { BlacklistItem } from '../App';

interface OPMock {
  id: string;
  opCode: string;
  armazem: string;
  ordens: number;
  totalItens: number;
  data: string;
  progresso: number;
  urgencia: UrgencyLevel;
  status: string;
  usuarioAtual?: string | null;
  observacao?: string;
  separados: number;
  transferidos: number;
  naoSeparados: number;
}

const mockOPs: OPMock[] = [
  { 
    id: '01', 
    opCode: '00659801001', 
    armazem: 'ELETRONICA', 
    ordens: 1, 
    totalItens: 12, 
    data: '2026-01-16T14:00:34.49', 
    progresso: 45, 
    urgencia: 'alta', 
    status: 'Em conferencia',
    usuarioAtual: 'Daniel',
    observacao: 'Urgente para linha de montagem 04',
    separados: 6,
    transferidos: 2,
    naoSeparados: 4
  },
  { 
    id: '02', 
    opCode: '00661201002', 
    armazem: 'CHICOTE', 
    ordens: 3, 
    totalItens: 28, 
    data: '2026-01-17T09:15:00.00', 
    progresso: 10, 
    urgencia: 'urgencia', 
    status: 'Pendente',
    usuarioAtual: null,
    observacao: 'Faltando componentes no setor',
    separados: 2,
    transferidos: 0,
    naoSeparados: 26
  }
];

const Separacao: React.FC<{ blacklist: BlacklistItem[] }> = ({ blacklist }) => {
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSyncing, setIsSyncing] = useState(true);
  const [selectedOP, setSelectedOP] = useState<OPMock | null>(null);
  const currentResponsavel = 'Daniel';

  useEffect(() => {
    const syncData = async () => {
      setIsSyncing(true);
      await new Promise(r => setTimeout(r, 700));
      setIsSyncing(false);
    };
    syncData();
  }, [viewMode]);

  const handleStart = (op: OPMock) => {
    if (op.usuarioAtual && op.usuarioAtual !== currentResponsavel) {
      alert(`Bloqueio de Segurança: O usuário "${op.usuarioAtual}" já está trabalhando nesta OP.`);
      return;
    }
    setSelectedOP(op);
    setViewMode('detail');
  };

  const getStatusBorder = (op: OPMock) => {
    if (op.urgencia === 'urgencia') return 'border-red-500 ring-4 ring-red-50';
    if (op.urgencia === 'alta') return 'border-orange-500 ring-4 ring-orange-50';
    return 'border-emerald-500 ring-4 ring-emerald-50';
  };

  if (isSyncing) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse tracking-[0.2em]">Sincronizando Separação...</p>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedOP) {
    return (
      <div className="space-y-6 animate-fadeIn pb-10">
        <div className="flex flex-col gap-4">
          <button onClick={() => setViewMode('list')} className="w-fit px-6 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2 hover:bg-gray-50 transition-all">
            ← Voltar
          </button>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900 uppercase">OP {selectedOP.opCode}</h2>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Armazém: {selectedOP.armazem} | Criado em: {selectedOP.data}</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6">
           <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
             <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col justify-center">
               <p className="text-3xl font-black text-gray-900 leading-none mb-2">{selectedOP.totalItens}</p>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total de Itens</p>
             </div>
             <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex flex-col justify-center">
               <p className="text-3xl font-black text-emerald-600 leading-none mb-2">{selectedOP.separados}</p>
               <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Separados</p>
             </div>
             <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex flex-col justify-center">
               <p className="text-3xl font-black text-blue-600 leading-none mb-2">{selectedOP.transferidos}</p>
               <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Transferidos</p>
             </div>
             <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex flex-col justify-center">
               <p className="text-3xl font-black text-amber-600 leading-none mb-2">{selectedOP.naoSeparados}</p>
               <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Não Separados</p>
             </div>
           </div>

           <div className="flex flex-col gap-4 w-full md:w-auto min-w-[320px]">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                 <p className="text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Documento (Transferência)</p>
                 <input type="text" placeholder="Nº do documento" className="w-full text-sm font-bold bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none uppercase placeholder-gray-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/10" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                 <p className="text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Responsável (Separação)</p>
                 <div className="w-full text-sm font-black text-gray-800 uppercase bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">{currentResponsavel}</div>
              </div>
           </div>
        </div>

        <div className="bg-white p-32 rounded-[3.5rem] text-center border-2 border-dashed border-gray-100 font-black text-gray-200 uppercase tracking-widest text-sm shadow-inner">
           Lista de Produtos Ativa
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 animate-fadeIn">
      {mockOPs.map((op) => {
        const isLocked = op.usuarioAtual && op.usuarioAtual !== currentResponsavel;
        return (
          <div 
            key={op.id} 
            className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all flex flex-col justify-between h-[36rem] relative overflow-hidden ${isLocked ? 'grayscale opacity-60 border-gray-200' : `hover:shadow-2xl ${getStatusBorder(op)}`}`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xl font-black text-gray-300 tracking-tighter">ID {op.id}</span>
                <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${op.urgencia === 'urgencia' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {op.urgencia}
                </span>
              </div>

              <div>
                <h4 className="text-[22px] font-black text-gray-900 uppercase leading-none tracking-tight">OP {op.opCode}</h4>
                <div className="mt-4 space-y-1.5 text-[10px] font-bold text-gray-500 uppercase">
                  <p className="flex items-center gap-2">📍 Armazém: <span className="text-gray-900 font-black">{op.armazem}</span></p>
                  <p className="flex items-center gap-2">📦 Ordens: <span className="text-gray-900 font-black">{op.ordens}</span></p>
                  <p className="flex items-center gap-2">📋 Itens: <span className="text-gray-900 font-black">{op.totalItens} itens</span></p>
                  <div className="pt-1 mt-1 border-t border-gray-50">
                    <p className="flex items-center gap-2">👤 Responsável: <span className={`font-black ${op.usuarioAtual ? 'text-emerald-700' : 'text-gray-400 italic'}`}>{op.usuarioAtual || 'Aguardando'}</span></p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 grid grid-cols-4 gap-2">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black text-gray-900 leading-none">{op.totalItens}</span>
                  <span className="text-[6px] font-black text-gray-400 uppercase mt-0.5">Total</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-emerald-600 leading-none">{op.separados}</span>
                  <span className="text-[6px] font-black text-emerald-400 uppercase mt-0.5">Sep.</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-blue-600 leading-none">{op.transferidos}</span>
                  <span className="text-[6px] font-black text-blue-400 uppercase mt-0.5">Tra.</span>
                </div>
                <div className="flex flex-col items-center border-l border-gray-100">
                  <span className="text-xs font-black text-amber-600 leading-none">{op.naoSeparados}</span>
                  <span className="text-[6px] font-black text-amber-400 uppercase mt-0.5">Falta</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Progresso</p>
                  <p className="text-lg font-black text-emerald-900 leading-none">{op.progresso}%</p>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${op.progresso}%` }}></div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{op.status}</span>
                <span className="text-[8px] font-mono font-bold text-gray-300">{op.data.split('T')[0]}</span>
              </div>
              <button 
                onClick={() => handleStart(op)} 
                className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-emerald-600 shadow-gray-100'}`}
              >
                {isLocked ? `EM USO: ${op.usuarioAtual}` : 'Iniciar Separação'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Separacao;
