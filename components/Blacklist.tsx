import React, { useState, useMemo, useRef } from 'react';
import { BlacklistItem } from '../App';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import Loading from './Loading';
import { useAlert } from './AlertContext';


import * as XLSX from 'xlsx';

interface BlacklistProps {
  items: BlacklistItem[];
  setItems: React.Dispatch<React.SetStateAction<BlacklistItem[]>>;
}

const Blacklist: React.FC<BlacklistProps & { user: User }> = ({ items, setItems, user }) => {
  const { showAlert } = useAlert();
  const [search, setSearch] = useState('');

  const [newCode, setNewCode] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    return items
      .filter(item => item.codigo.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [items, search]);

  const handleAdd = async () => {
    if (!newCode) return;
    const newItem = {
      codigo: newCode.toUpperCase().trim(),
      nao_sep: true,
      talvez: false,
      data_inclusao: new Date().toLocaleDateString('pt-BR')
    };

    const { data, error } = await supabase.from('blacklist').insert(newItem).select();
    if (error) showAlert('Erro ao adicionar à BlackList: ' + error.message, 'error');
    else if (data) {
      setItems(prev => [...prev, data[0]]);
      setNewCode('');
    }
  };

  const toggleStatus = async (id: string, field: 'nao_sep' | 'talvez') => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newValue = !item[field as keyof BlacklistItem];

    // Optimistic Update
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: newValue } : i));

    const { error } = await supabase
      .from('blacklist')
      .update({ [field]: newValue })
      .eq('id', id);

    if (error) {
      showAlert('Erro ao atualizar status: ' + error.message, 'error');
      // Revert on error
      setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: !newValue } : i));
    }
  };

  const markAll = (field: 'nao_sep' | 'talvez') => {
    const allChecked = filteredItems.every(item => item[field as keyof BlacklistItem]);
    const targetIds = new Set(filteredItems.map(i => i.id));
    const newValue = !allChecked;

    setItems(items.map(item =>
      targetIds.has(item.id) ? { ...item, [field]: newValue } : item
    ));

    // Batch update would be better, but for simplicity we assume the user marks one by one or we'd need a multi-update RPC.
  };

  const handleRemove = async (id: string) => {
    if (confirm('Deseja remover este item da BlackList?')) {
      const { error } = await supabase.from('blacklist').delete().eq('id', id);
      if (error) showAlert('Erro ao remover: ' + error.message, 'error');
      else setItems(prev => prev.filter(item => item.id !== id));
    }
  };


  const handleClearAll = async () => {
    if (confirm('Deseja limpar toda a BlackList?')) {
      const { error } = await supabase.from('blacklist').delete().neq('id', '0');
      if (error) showAlert('Erro ao limpar: ' + error.message, 'error');
    }
  };

  const downloadModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["BLACK LIST"],
      ["CÓDIGO"],
      ["MP0210000000013"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ModeloBlacklist");
    XLSX.writeFile(wb, "modelo_blacklist.xlsx");
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="mb-2">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">BlackList</h1>
        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">Gestão de Restrições e Exceções</p>
      </div>

      {/* Toolbar Ajustada */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col lg:flex-row items-center gap-6">
        <div className="flex items-center gap-3 w-full lg:w-auto flex-1">
          <input
            type="text"
            placeholder="CÓDIGO DO PRODUTO"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full px-6 py-4 bg-gray-50 border border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-red-500 focus:bg-white font-bold text-sm transition-all shadow-inner uppercase placeholder-gray-300"
          />
          <button
            onClick={handleAdd}
            className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center gap-2 active:scale-95 shrink-0"
          >
            <span>+</span> ADICIONAR
          </button>
        </div>

        <div className="h-10 w-px bg-gray-100 hidden lg:block"></div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadModelo}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-100 text-gray-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
            MODELO
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIsImporting(true);
              const reader = new FileReader();
              reader.onload = async (evt) => {
                try {
                  const bstr = evt.target?.result;
                  const wb = XLSX.read(bstr, { type: 'binary' });
                  const wsname = wb.SheetNames[0];
                  const ws = wb.Sheets[wsname];
                  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                  // Mapeamento: Col A (0) Código. Linha 2 cabeçalho, Linha 3 dados.
                  const blacklistItems = data.slice(2).filter(row => row[0]).map((row) => ({
                    codigo: String(row[0]).trim().toUpperCase(),
                    nao_sep: true,
                    talvez: false,
                    data_inclusao: new Date().toLocaleDateString('pt-BR')
                  }));

                  if (blacklistItems.length === 0) {
                    showAlert('Nenhum dado válido encontrado (verifique a partir da linha 3).', 'warning');
                    return;
                  }

                  await upsertBatched('blacklist', blacklistItems, 500);
                  showAlert(`${blacklistItems.length} itens adicionados à BlackList!`, 'success');
                } catch (err: any) {
                  showAlert('Erro na importação: ' + err.message, 'error');
                } finally {
                  setIsImporting(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              };
              reader.readAsBinaryString(file);
            }}
            accept=".xlsx, .xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className={`flex items-center gap-2 px-5 py-3 bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-50 ${isImporting ? 'opacity-50' : ''}`}
          >
            {isImporting ? '⏳ ...' : 'IMPORTAR'}
          </button>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-5 py-3 bg-gray-50 border border-gray-100 text-gray-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
          >
            LIMPAR
          </button>
        </div>

        <div className="relative w-full lg:w-64">
          <input
            type="text"
            placeholder="PESQUISAR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-gray-100 border-transparent rounded-2xl focus:bg-white focus:ring-2 focus:ring-gray-200 outline-none text-[11px] font-bold shadow-inner uppercase tracking-wider"
          />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 text-xl">🔍</span>
        </div>
      </div>

      {/* Tabela Ajustada para padrão do projeto */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                <th className="px-10 py-8 w-[35%]">CÓDIGO</th>
                <th className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={() => markAll('nao_sep')}
                      className="text-[8px] bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-600 hover:text-white transition-all font-black uppercase tracking-widest shadow-sm"
                    >
                      Todos
                    </button>
                    <span className="text-red-500 font-black">NÃO SEP</span>
                  </div>
                </th>
                <th className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={() => markAll('talvez')}
                      className="text-[8px] bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-600 hover:text-white transition-all font-black uppercase tracking-widest shadow-sm"
                    >
                      Todos
                    </button>
                    <span className="text-blue-500 font-black">TALVEZ</span>
                  </div>
                </th>
                <th className="px-6 py-8 text-center">DATA INCLUSÃO</th>
                <th className="px-10 py-8 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-10 py-20 text-center">
                    <Loading message="Carregando Blacklist..." color="#EF4444" />
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (

                <tr>
                  <td colSpan={5} className="px-10 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-10">
                      <span className="text-6xl">🚫</span>
                      <p className="text-gray-900 font-black uppercase tracking-widest text-[10px]">Lista Vazia</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full shadow-sm ${item.talvez ? 'bg-amber-400' : 'bg-red-500'}`}></div>
                        <span className="font-mono text-sm font-bold text-gray-700 tracking-tight uppercase">{item.codigo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <input
                        type="checkbox"
                        checked={item.nao_sep}
                        onChange={() => toggleStatus(item.id, 'nao_sep')}
                        className="w-8 h-8 rounded-lg border-2 border-gray-200 text-red-600 focus:ring-red-500 cursor-pointer transition-all hover:scale-110"
                      />
                    </td>
                    <td className="px-6 py-6 text-center">
                      <input
                        type="checkbox"
                        checked={item.talvez}
                        onChange={() => toggleStatus(item.id, 'talvez')}
                        className="w-8 h-8 rounded-lg border-2 border-gray-200 text-blue-600 focus:ring-blue-500 cursor-pointer transition-all hover:scale-110"
                      />
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="text-[10px] font-bold text-gray-400 font-mono tracking-widest bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{item.data_inclusao}</span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      {user.role === 'admin' && (
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="inline-flex items-center justify-center w-8 h-8 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-red-100 shadow-sm"
                          title="Remover da Blacklist"
                        >
                          <span className="text-[14px] font-black italic">✕</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Blacklist;
