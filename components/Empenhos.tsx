import React, { useState, useEffect, useRef } from 'react';
import { UrgencyLevel } from '../types';
import * as XLSX from 'xlsx';
import { supabase, upsertBatched } from '../services/supabaseClient';
import { useAlert } from './AlertContext';
import { getLocalDateString } from '../services/dateUtils';


interface PendingOP {
  id: string;
  data: string;
  itens: { codigo: string; descricao: string; quantidade: number; unidade: string; observacao?: string }[];
  teaItem?: { produto: string; descricao: string; quantidade: number };
  prioridade: UrgencyLevel;
}

const Empenhos: React.FC = () => {
  const { showAlert } = useAlert();
  const [ops, setOps] = useState<PendingOP[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [globalWarehouse, setGlobalWarehouse] = useState('');
  const [destinoTea, setDestinoTea] = useState('Armazém 04');
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateItems, setDuplicateItems] = useState<{ op: string; status: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
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

        const opsMap: { [key: string]: PendingOP } = {};
        // Data starts at row 3 (index 2)
        data.slice(2).filter(row => row[0]).forEach(row => {
          const opId = String(row[0]).trim(); // Coluna A
          if (!opsMap[opId]) {
            opsMap[opId] = {
              id: opId,
              data: getLocalDateString(),
              itens: [],
              prioridade: 'media'
            };
          }
          opsMap[opId].itens.push({
            codigo: String(row[20] || '').trim(), // Coluna U (Código)
            descricao: String(row[21] || '').trim(), // Coluna V (Descrição)
            quantidade: Number(row[22]) || 0, // Coluna W (Quantidade)
            unidade: 'UN',
            observacao: String(row[23] || '').trim() // Coluna X (Observação)
          });

          // Capture TEA-specific info only once per OP
          if (!opsMap[opId].teaItem) {
            opsMap[opId].teaItem = {
              produto: String(row[1] || '').trim(), // Coluna B (Produto TEA)
              descricao: String(row[2] || '').trim(), // Coluna C (Descrição TEA)
              quantidade: Number(row[7]) || 0 // Coluna H (Quantidade TEA)
            };
          }
        });
        const importedOps = Object.values(opsMap);
        setOps(prev => [...prev, ...importedOps]);
        setSelectedIds(prev => [...prev, ...importedOps.map(op => op.id)]);
      } catch (error: any) {
        showAlert('Erro: ' + error.message, 'error');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const checkExistingOPs = async (opIds: string[]) => {
    const duplicates: { op: string; status: string }[] = [];

    // 1. Check in Separacao (Active)
    const { data: sepData } = await supabase.from('separacao').select('documento, ordens').overlaps('ordens', opIds);
    if (sepData) {
      sepData.forEach((row: any) => {
        const found = row.ordens.filter((o: string) => opIds.includes(o));
        found.forEach((o: string) => duplicates.push({ op: o, status: 'Em Separação' }));
      });
    }

    // 2. Check in Conferencia (Auditing)
    const { data: confData } = await supabase.from('conferencia').select('documento, ordens').overlaps('ordens', opIds);
    if (confData) {
      confData.forEach((row: any) => {
        const found = row.ordens.filter((o: string) => opIds.includes(o));
        found.forEach((o: string) => duplicates.push({ op: o, status: 'Em Conferência' }));
      });
    }

    // 3. Check in Historico (Finished or TEA)
    const { data: histData } = await supabase.from('historico').select('documento, armazem').in('documento', opIds);
    if (histData) {
      histData.forEach((row: any) => {
        duplicates.push({
          op: row.documento,
          status: 'Finalizada'
        });
      });
    }

    return duplicates;
  };

  const handleGenerateList = async () => {
    if (selectedIds.length === 0 || !globalWarehouse) {
      showAlert('Selecione pelo menos uma OP e um armazém de destino.', 'warning');
      return;
    }

    setIsGenerating(true);
    const selectedOps = ops.filter(op => selectedIds.includes(op.id));
    const opIds = selectedOps.map(o => o.id);

    // Check for duplicates
    const dups = await checkExistingOPs(opIds);
    if (dups.length > 0) {
      setDuplicateItems(dups);
      setShowDuplicateModal(true);
      setIsGenerating(false);
      return;
    }

    // Consolidate Items
    const consolidatedMap: { [key: string]: any } = {};
    selectedOps.forEach(op => {
      op.itens.forEach(item => {
        if (!consolidatedMap[item.codigo]) {
          consolidatedMap[item.codigo] = {
            ...item,
            separado: false,
            transferido: false,
            falta: false,
            ok: false,
            lupa: false,
            tr: false,
            qtd_separada: 0,
            composicao: []
          };
        }
        consolidatedMap[item.codigo].composicao.push({
          op: op.id,
          quantidade: item.quantidade,
          separado: 0, // Individual quantity separated for this OP
          concluido: false,
          observacao: item.observacao || ''
        });
      });
    });

    // Sum total quantities for consolidated items and format correctly
    const formattedItens = Object.values(consolidatedMap).map(item => {
      const totalQtd = item.composicao.reduce((sum: number, c: any) => sum + c.quantidade, 0);
      return {
        codigo: item.codigo,
        descricao: item.descricao,
        quantidade: totalQtd,
        unidade: item.unidade,
        observacao: item.observacao || '',
        separado: false,
        transferido: false,
        falta: false,
        ok: false,
        lupa: false,
        tr: false,
        qtd_separada: 0,
        composicao: item.composicao
      };
    });

    const maxUrgency = selectedOps.some(o => o.prioridade === 'urgencia') ? 'urgencia' :
      selectedOps.some(o => o.prioridade === 'alta') ? 'alta' : 'media';

    const lotName = selectedOps.length > 1
      ? `Lote-${selectedOps[0].id.slice(-4)}-G${selectedOps.length}`
      : `OP-${selectedOps[0].id}`;

    const lotToInsert = {
      documento: lotName,
      nome: lotName,
      armazem: globalWarehouse,
      ordens: selectedOps.map(op => op.id),
      itens: formattedItens,
      status: 'pendente',
      urgencia: maxUrgency,
      data_criacao: new Date().toISOString()
    };

    try {
      await upsertBatched('separacao', [lotToInsert], 900);

      showAlert(`Sucesso! Gerado 1 lote consolidado para as OPs selecionadas.`, 'success');
      setOps(prev => prev.filter(op => !selectedIds.includes(op.id)));
      setSelectedIds([]);
    } catch (error: any) {
      alert('Erro ao gerar lista: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateOpPriority = (id: string, prio: UrgencyLevel) => {
    setOps(prev => prev.map(op => op.id === id ? { ...op, prioridade: prio } : op));
  };


  const removeOp = (id: string) => {
    setOps(prev => prev.filter(op => op.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex justify-between items-center bg-[var(--bg-secondary)] p-4 rounded-xl border-l-4 border-[#006B47] shadow-[var(--shadow-sm)]">
        <h1 className="text-sm font-black text-[#006B47] uppercase tracking-widest">Empenhos</h1>
        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
          Data do Sistema: <span className="text-[#006B47]">{getLocalDateString()}</span>
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)] p-10 rounded-[2.5rem] border border-[var(--border-light)] shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <h2 className="text-xs font-black text-gray-600 uppercase tracking-widest">Selecione as Ordens de Produção</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { }} className="px-5 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl text-[9px] font-black uppercase text-[var(--text-primary)] flex items-center gap-2 hover:bg-[var(--bg-inner)] transition-all">
              📄 Baixar Modelo Excel
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportExcel} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="px-5 py-2.5 bg-[#004D33] text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all">
              🕹️ {isImporting ? 'Importando...' : 'Importar Ordens (Excel)'}
            </button>
            <button onClick={handleGenerateList} disabled={selectedIds.length === 0 || !globalWarehouse || isGenerating} className="px-5 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl text-[9px] font-black uppercase text-[var(--text-muted)] flex items-center gap-2 hover:bg-[var(--bg-inner)] disabled:opacity-50">
              ✅ {isGenerating ? 'Processando...' : 'Gerar Lista de Separação'}
            </button>
            <button onClick={() => { setOps([]); setSelectedIds([]); }} className="px-5 py-2.5 bg-[#EF4444] text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:opacity-90 transition-all">
              🗑️ Limpar Tudo
            </button>
          </div>
        </div>

        <div className="bg-[var(--bg-inner)]/50 p-4 rounded-[2rem] border border-[var(--border-light)]">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {ops.map((op) => (
              <button
                key={op.id}
                onClick={() => toggleSelect(op.id)}
                className={`px-4 py-3 rounded-xl border-2 text-[10px] font-black transition-all ${selectedIds.includes(op.id)
                  ? 'bg-[var(--bg-secondary)] border-[#10B981] text-[#10B981] shadow-lg shadow-emerald-500/10'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-muted)]'
                  }`}
              >
                {op.id}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs">✨</span>
          <p className="text-[10px] font-black text-[#10B981] uppercase tracking-widest">
            {selectedIds.length} OPS SELECIONADAS PARA EMPENHO
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="space-y-6">
          <div className="bg-[var(--bg-secondary)] p-8 rounded-[2.5rem] border border-[var(--border-light)] shadow-sm space-y-6">
            <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Armazém (Destino)</h3>
            <select
              value={globalWarehouse}
              onChange={(e) => setGlobalWarehouse(e.target.value)}
              className="w-full bg-[var(--bg-inner)] border-none rounded-2xl py-4 px-6 text-xs font-black text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all mb-4"
            >
              <option value="">Selecione...</option>
              <option value="CHICOTE">CHICOTE</option>
              <option value="MECANICA">MECÂNICA</option>
              <option value="ELETRONICA">ELETRÔNICA</option>
            </select>


          </div>

          <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 space-y-3">
            <p className="text-[10px] font-black text-[#006B47] uppercase leading-relaxed">
              DICA: O ARMAZÉM SELECIONADO SERÁ APLICADO A TODO O LOTE DE SEPARAÇÃO.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-[var(--bg-secondary)] rounded-[2.5rem] border border-[var(--border-light)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[var(--bg-inner)]/50 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-light)]">
                  <th className="px-8 py-6 flex items-center gap-2">📋 ORDEM DE PRODUÇÃO</th>
                  <th className="px-6 py-6 text-center">DATA</th>
                  <th className="px-6 py-6 text-center">PRIORIDADE (EDITÁVEL)</th>
                  <th className="px-8 py-6 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {ops.filter(o => selectedIds.includes(o.id)).map((op) => (
                  <tr key={op.id} className="group hover:bg-[var(--bg-inner)]/50 transition-colors">
                    <td className="px-8 py-6 font-black text-[var(--text-primary)] text-xs">
                      {op.id}
                    </td>
                    <td className="px-6 py-6 text-center text-[10px] font-bold text-[var(--text-muted)]">
                      {op.data}
                    </td>
                    <td className="px-6 py-6 text-center">
                      <select
                        value={op.prioridade}
                        onChange={(e) => updateOpPriority(op.id, e.target.value as UrgencyLevel)}
                        className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase outline-none border-none cursor-pointer transition-all ${op.prioridade === 'urgencia' ? 'bg-red-50 text-red-500' :
                          op.prioridade === 'alta' ? 'bg-orange-50 text-orange-500' :
                            'bg-emerald-50 text-emerald-500'
                          }`}
                      >
                        <option value="media">MÉDIA</option>
                        <option value="alta">ALTA</option>
                        <option value="urgencia">URGÊNCIA</option>
                      </select>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-6">
                        <button className="text-[10px] font-black text-[#10B981] uppercase tracking-tighter hover:opacity-70">Adc +</button>
                        <button onClick={() => removeOp(op.id)} className="flex items-center gap-2 text-[10px] font-black text-[#EF4444] uppercase tracking-tighter hover:opacity-70 transition-all">
                          Excluir 🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedIds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-16 text-center text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em]">
                      Nenhuma OP selecionada para listagem
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Alerta de Duplicidade */}
      <DuplicateOPModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicates={duplicateItems}
      />
    </div>
  );
};

const DuplicateOPModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  duplicates: { op: string; status: string }[]
}> = ({ isOpen, onClose, duplicates }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-[var(--bg-secondary)] w-full max-w-lg rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(239,68,68,0.3)] overflow-hidden animate-scaleIn border border-white/20">
        <div className="bg-gradient-to-r from-rose-600 to-rose-500 px-10 py-10 flex flex-col items-center text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center text-4xl mb-6 shadow-inner animate-pulse">
            ⚠️
          </div>
          <h3 className="text-xl font-black uppercase tracking-[0.2em] leading-none mb-2">Atenção Crítica</h3>
          <p className="text-[10px] font-bold text-rose-100 uppercase tracking-widest opacity-80">Risco de Duplicidade de Lote</p>
        </div>

        <div className="p-10 space-y-8 bg-[var(--bg-secondary)]">
          <p className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] text-center leading-relaxed">
            As seguintes OPs já possuem registros <span className="text-rose-500">Ativos</span> ou <span className="text-emerald-500">Finalizados</span> no ecossistema:
          </p>

          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
            {duplicates.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-5 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-[1.5rem] group hover:border-rose-300/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-rose-500 font-black text-xs">
                    #
                  </div>
                  <span className="text-sm font-black text-[var(--text-primary)] uppercase font-mono tracking-tighter">{item.op}</span>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm ${item.status === 'Finalizada' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                  }`}>
                  {item.status}
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shrink-0 shadow-sm">💡</div>
            <p className="text-[10px] font-black text-rose-900 uppercase leading-relaxed tracking-tight">
              Recomendação: Remova estas OPs do seu arquivo de importação para evitar erros de estoque e divergências na auditoria.
            </p>
          </div>
        </div>

        <div className="px-10 pb-10 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-5 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(225,29,72,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Vou Corrigir Agora
          </button>
        </div>
      </div>
    </div>
  );
};

export default Empenhos;
