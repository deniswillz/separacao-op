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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-6 group hover:shadow-2xl transition-all">
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center text-5xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">📥</div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase">Receber da Matriz</h3>
            <p className="text-gray-400 font-bold text-xs uppercase mt-2">Clique para importar novas OPs via TEA</p>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"
          >
            {isImporting ? 'Processando...' : 'Carregar Excel TEA'}
          </button>
        </div>

        <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-6 group hover:shadow-2xl transition-all">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center text-5xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">🕒</div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase">Histórico de Fluxo</h3>
            <p className="text-gray-400 font-bold text-xs uppercase mt-2">Veja o rastreio completo das ordens</p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-10 py-5 bg-gray-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-gray-200 hover:bg-black transition-all"
          >
            {showHistory ? 'Ocultar Histórico' : 'Ver Histórico TEA'}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm mt-8 overflow-hidden animate-fadeIn">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
                <th className="px-10 py-8">OP</th>
                <th className="px-10 py-8">FLUXO ATUAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(item => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-10 py-8 font-black text-gray-800 font-mono italic">{item.op}</td>
                  <td className="px-10 py-8">
                    <div className="flex gap-4">
                      {item.fluxo?.map((f: any, idx: number) => (
                        <div key={idx} className="flex flex-col items-center">
                          <span className="text-2xl">{f.icon}</span>
                          <span className="text-[10px] font-black text-gray-400 uppercase mt-1">{f.status}</span>
                        </div>
                      ))}
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
