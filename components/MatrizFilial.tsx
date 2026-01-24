import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import * as XLSX from 'xlsx';

interface TEAItem {
  id: string;
  op: string;
  fluxo: any[];
}

const MatrizFilial: React.FC<{ user: User }> = ({ user }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<TEAItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('historico').select('*').order('id', { ascending: false });
    if (error) console.error(error);
    else setHistory(data || []);
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

        const teaData = data.slice(1).filter(row => row[0]).map(row => ({
          op: String(row[0]).trim(),
          fluxo: [
            { status: 'Matriz', icon: '🏢', data: new Date().toLocaleDateString('pt-BR') }
          ]
        }));

        await upsertBatched('historico', teaData, 500);
        alert('Ordens integradas com sucesso!');
        fetchHistory();
      } catch (error: any) {
        alert('Erro: ' + error.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest animate-pulse">Sincronizando TEA...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Integração TEA</h1>
          <p className="text-gray-400 font-extrabold text-[12px] uppercase tracking-widest mt-1">Sincronização entre Matriz e Filial</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-6 group hover:shadow-xl transition-all">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm shrink-0">📥</div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-black text-gray-900 uppercase">Receber Matriz</h3>
            <p className="text-gray-400 font-bold text-[10px] uppercase mt-0.5">Importar/Sincronizar TEA</p>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-700 transition-all"
            >
              {isImporting ? 'Lendo...' : 'Carregar Excel'}
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-6 group hover:shadow-xl transition-all">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm shrink-0">🕒</div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-black text-gray-900 uppercase">Rastreio Fluxo</h3>
            <p className="text-gray-400 font-bold text-[10px] uppercase mt-0.5">Histórico completo TEA</p>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="mt-2 px-4 py-2 bg-gray-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-black transition-all"
            >
              {showHistory ? 'Ocultar' : 'Ver Fluxo'}
            </button>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm mt-6 overflow-hidden animate-fadeIn">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                <th className="px-8 py-6">OP</th>
                <th className="px-8 py-6">FLUXO ATUAL & AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(item => (
                <tr key={item.id} className="hover:bg-gray-50/30 transition-all">
                  <td className="px-8 py-6">
                    <span className="font-black text-gray-800 font-mono italic text-sm">{item.op}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex gap-2 mr-6 border-r border-gray-100 pr-6">
                        {item.fluxo?.map((f: any, idx: number) => (
                          <div key={idx} className="flex flex-col items-center opacity-60">
                            <span className="text-xl">{f.icon}</span>
                            <span className="text-[8px] font-black text-gray-400 uppercase mt-1">{f.status}</span>
                          </div>
                        ))}
                      </div>

                      {/* Ações manuais TEA */}
                      <div className="flex gap-2">
                        {['Endereçar', 'Em Transito', 'Finalizar'].map((step) => {
                          const icon = step === 'Endereçar' ? '📍' : step === 'Em Transito' ? '🚚' : '🏁';
                          const alreadyOn = item.fluxo?.some((f: any) => f.status === step);
                          return (
                            <button
                              key={step}
                              disabled={alreadyOn}
                              onClick={async () => {
                                const newFluxo = [...(item.fluxo || []), {
                                  status: step,
                                  icon,
                                  data: new Date().toLocaleDateString('pt-BR')
                                }];
                                const { error } = await supabase
                                  .from('historico')
                                  .update({ fluxo: newFluxo })
                                  .eq('id', item.id);
                                if (!error) fetchHistory();
                              }}
                              className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${alreadyOn ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white border-blue-100 text-blue-600 hover:bg-blue-50'}`}
                            >
                              {icon} {step}
                            </button>
                          );
                        })}
                      </div>
                    </div>
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

export default MatrizFilial;
