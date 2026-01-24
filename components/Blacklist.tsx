import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase, upsertBatched } from '../services/supabaseClient';
import * as XLSX from 'xlsx';

interface BlacklistItem {
  id: string;
  codigo: string;
  descricao: string;
  nao_sep: boolean;
  talvez: boolean;
}

const Blacklist: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBlacklist = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('blacklist').select('*');
    if (error) console.error(error);
    else setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBlacklist();
  }, []);

  const handleToggle = async (id: string, field: 'nao_sep' | 'talvez', value: boolean) => {
    const { error } = await supabase
      .from('blacklist')
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      alert('Erro ao atualizar: ' + error.message);
    } else {
      setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir este item da blacklist?')) {
      const { error } = await supabase.from('blacklist').delete().eq('id', id);
      if (error) alert(error.message);
      else setItems(prev => prev.filter(item => item.id !== id));
    }
  };

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

        const blacklistData = data.slice(1).filter(row => row[0]).map(row => ({
          codigo: String(row[0]).trim(),
          descricao: String(row[1] || '').trim(),
          nao_sep: String(row[2]).toLowerCase() === 'sim',
          talvez: String(row[3]).toLowerCase() === 'sim'
        }));

        await upsertBatched('blacklist', blacklistData, 500);
        alert('Blacklist importada com sucesso!');
        fetchBlacklist();
      } catch (error: any) {
        alert('Erro: ' + error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const filtered = items.filter(i =>
    i.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest animate-pulse">Sincronizando Blacklist...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Blacklist de Separação</h1>
          <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest mt-1">Produtos bloqueados ou em auditoria</p>
        </div>
        <div className="flex gap-4">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">Importar Excel</button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mb-6">
        <input
          type="text"
          placeholder="Buscar produto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-6 py-4 bg-gray-50 border border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/10 font-bold text-sm transition-all"
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-widest border-b border-gray-100">
              <th className="px-8 py-6">PRODUTO</th>
              <th className="px-6 py-6 text-center">NÃO SEPARAR</th>
              <th className="px-6 py-6 text-center">AUDITORIA</th>
              <th className="px-8 py-6 text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/50 transition-all">
                <td className="px-8 py-6">
                  <p className="font-mono text-sm font-black text-gray-800">{item.codigo}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">{item.descricao}</p>
                </td>
                <td className="px-6 py-6 text-center">
                  <input
                    type="checkbox"
                    checked={item.nao_sep}
                    onChange={(e) => handleToggle(item.id, 'nao_sep', e.target.checked)}
                    className="w-6 h-6 rounded-lg border-gray-200 text-red-600 focus:ring-red-500"
                  />
                </td>
                <td className="px-6 py-6 text-center">
                  <input
                    type="checkbox"
                    checked={item.talvez}
                    onChange={(e) => handleToggle(item.id, 'talvez', e.target.checked)}
                    className="w-6 h-6 rounded-lg border-gray-200 text-amber-500 focus:ring-amber-500"
                  />
                </td>
                <td className="px-8 py-6 text-right">
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-300 hover:text-red-600 transition-all">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Blacklist;
