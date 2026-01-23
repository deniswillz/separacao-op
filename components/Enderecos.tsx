
import React, { useState, useMemo } from 'react';
import { Product } from '../types';

const initialItems: Product[] = [
  { id: 1, codigo: 'MP0210000000013', descricao: 'RESISTOR FILME ESP 220 K OHMS 5% 1/8W SMD 0805', endereco: 'A0010', armazem: '20', unidade: 'PC' },
  { id: 2, codigo: 'PA0902000000026', descricao: 'CABO DE 14 LINHAS SEMENTE MALHA', endereco: 'B0155', armazem: '10', unidade: 'M' },
  { id: 3, codigo: 'MP0101000000164', descricao: 'CAPA DE PLASTICO PA66HS IN', endereco: 'C0200', armazem: '15', unidade: 'PC' },
];

const Enderecos: React.FC = () => {
  const [items, setItems] = useState<Product[]>(initialItems);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.endereco?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  const handleDelete = (id: string | number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAll = () => {
    if (confirm('Tem certeza que deseja limpar todos os endereços?')) {
      setItems([]);
    }
  };

  // Simulação de importação seguindo a regra das colunas Excel
  const handleImportExcel = () => {
    alert(`Regras de Importação ativas:\nLinha 2 (CABEÇALHO)\nCol A: Armazém\nCol D: Código\nCol E: Descrição\nCol I: Endereço\nCol N: Unidade`);
    // Aqui viria a lógica real de leitura de arquivo (FileReader + biblioteca XLSX)
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Cabeçalho do Título */}
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Endereços de Estoque</h1>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm mt-1">Localização dos produtos no armazém</p>
      </div>

      {/* Barra de Ferramentas */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-6 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Buscar endereço ou produto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-sm font-bold shadow-inner" 
            />
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 text-xl">🔍</span>
          </div>
          <div className="bg-[#006B47] text-white px-6 py-3 rounded-2xl font-black text-xs flex items-center justify-center min-w-[120px]">
            {items.length.toLocaleString('pt-BR')} itens
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handleImportExcel}
            className="flex items-center gap-3 px-8 py-4 bg-[#006B47] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#004D33] transition-all shadow-xl shadow-emerald-100"
          >
            <span className="text-lg">📥</span> Importar Excel
          </button>
          <button 
            onClick={handleClearAll}
            className="flex items-center gap-3 px-8 py-4 bg-[#EF4444] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#DC2626] transition-all shadow-xl shadow-red-100"
          >
            <span className="text-lg">🗑️</span> Limpar Tudo
          </button>
        </div>
      </div>

      {/* Tabela de Endereços */}
      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                <th className="px-10 py-8">CÓDIGO</th>
                <th className="px-6 py-8">DESCRIÇÃO</th>
                <th className="px-6 py-8 text-center">ENDEREÇO</th>
                <th className="px-6 py-8 text-center">ARMAZÉM</th>
                <th className="px-10 py-8 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-10 py-6">
                    <span className="font-mono text-xs font-black text-gray-700 tracking-tighter uppercase">{item.codigo}</span>
                  </td>
                  <td className="px-6 py-6">
                    <p className="text-xs font-bold text-gray-500 uppercase leading-snug line-clamp-1 max-w-xl">{item.descricao}</p>
                    <span className="text-[9px] font-black text-emerald-600/50 uppercase">UNI: {item.unidade}</span>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className="font-black text-sm text-gray-800 tracking-tight">{item.endereco}</span>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className="font-black text-sm text-gray-800">{item.armazem}</span>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100"
                    >
                      🗑️ Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-10 py-20 text-center text-gray-400 font-black uppercase tracking-widest text-xs">
                    Nenhum produto encontrado na base de endereços
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Enderecos;
