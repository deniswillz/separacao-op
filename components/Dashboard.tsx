import React, { useState, useEffect, useRef } from 'react';
import { analyzeLogisticsEfficiency } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '../services/supabaseClient';

const Dashboard: React.FC = () => {
  const [insights, setInsights] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [alerts, setAlerts] = useState<{ id: string, op: string, produto: string, timestamp: string }[]>([]);
  const [kpiData, setKpiData] = useState({ pendingOps: 0, finalizedMonth: 0, inTransit: 0 });
  const [opStatusList, setOpStatusList] = useState<{ id: string, name: string, ordens: string[], type: 'Separação' | 'Conferência', status: string, usuario: string | null, data: string }[]>([]);
  const [showOPListModal, setShowOPListModal] = useState<{ open: boolean, ops: string[], title: string }>({ open: false, ops: [], title: '' });
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsSyncing(true);

      const { data: sepData } = await supabase.from('separacao').select('id, status, usuario_atual, data_criacao, nome, ordens');
      const { data: confData } = await supabase.from('conferencia').select('id, status, responsavel_conferencia, data_conferencia, documento');

      const pending = (sepData?.filter(d => d.status?.toLowerCase() === 'pendente' || d.status?.toLowerCase() === 'em_separacao').length || 0) +
        (confData?.filter(d => d.status?.toLowerCase() === 'pendente' || d.status?.toLowerCase() === 'aguardando' || d.status?.toLowerCase() === 'em_conferencia').length || 0);

      const finalized = (sepData?.filter(d => d.status?.toLowerCase() === 'finalizado' || d.status?.toLowerCase() === 'concluido').length || 0) +
        (confData?.filter(d => d.status?.toLowerCase() === 'finalizado' || d.status?.toLowerCase() === 'concluido').length || 0);

      setKpiData({
        pendingOps: pending,
        finalizedMonth: finalized,
        inTransit: 0
      });

      // Transformar para o formato dos mini cards e filtrar por data
      const combined = [
        ...(sepData || []).map(d => ({
          id: d.id,
          name: d.nome || `OP ${d.id.toString().slice(0, 8)}`,
          ordens: d.ordens || [],
          type: 'Separação' as const,
          status: d.status,
          usuario: d.usuario_atual,
          data: d.data_criacao
        })),
        ...(confData || []).map(d => ({
          id: d.id,
          name: d.documento || `DOC ${d.id.toString().slice(0, 8)}`,
          ordens: [],
          type: 'Conferência' as const,
          status: d.status,
          usuario: d.responsavel_conferencia,
          data: d.data_conferencia
        }))
      ];

      setOpStatusList(combined);
      setIsSyncing(false);
    };

    fetchDashboardData();

    // Sincronização em tempo real
    const channel = supabase.channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'separacao' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferencia' }, fetchDashboardData)
      .subscribe();

    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

    const handleFaltaAlert = (e: any) => {
      const { op, produto } = e.detail;
      const newAlert = {
        id: Math.random().toString(36).substr(2, 9),
        op,
        produto,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      setAlerts(prev => [newAlert, ...prev].slice(0, 5));
      if (audioRef.current) audioRef.current.play().catch(() => { });
    };

    window.addEventListener('falta-detectada', handleFaltaAlert);

    const fetchAI = async () => {
      setLoadingAI(true);
      try {
        const mockHistory = [{ item: 'PARAF-01', falta: true, data: '2023-10-01' }];
        const data = await analyzeLogisticsEfficiency(mockHistory);
        setInsights(data);
      } catch (error: any) {
        console.error('Error in Dashboard fetchAI:', error);
        setInsights({ resumo: 'Limite de cota de análise atingido (429). Tente novamente em 1 minuto.' });
      } finally {
        setLoadingAI(false);
      }
    };
    fetchAI();

    return () => {
      window.removeEventListener('falta-detectada', handleFaltaAlert);
      supabase.removeChannel(channel);
    };
  }, []);

  if (isSyncing) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-24 space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest animate-pulse">Sincronizando Ecossistema...</p>
      </div>
    );
  }

  const kpis = [
    { label: 'OPs Pendentes', value: kpiData.pendingOps.toString().padStart(2, '0'), color: 'bg-orange-500', icon: '⏳' },
    { label: 'Finalizadas (Mês)', value: kpiData.finalizedMonth.toString().padStart(2, '0'), color: 'bg-emerald-600', icon: '✅' },
    { label: 'Itens em Trânsito', value: kpiData.inTransit.toString().padStart(2, '0'), color: 'bg-blue-600', icon: '🚚' },
    { label: 'Faltas Críticas', value: alerts.length.toString().padStart(2, '0'), color: 'bg-red-600', icon: '🚨' },
  ];

  const chartData = [
    { name: 'Seg', valor: 45 }, { name: 'Ter', valor: 52 }, { name: 'Qua', valor: 38 },
    { name: 'Qui', valor: 65 }, { name: 'Sex', valor: 48 }, { name: 'Sáb', valor: 20 },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Custom Modal for OP List */}
      {showOPListModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[900] flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scaleIn border border-gray-100 text-left">
            <div className="bg-gray-900 p-8 flex justify-between items-center text-white">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Lista de OPs do Lote</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{showOPListModal.title}</p>
              </div>
              <button onClick={() => setShowOPListModal({ open: false, ops: [], title: '' })} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm">✕</button>
            </div>
            <div className="p-10 space-y-4 max-h-[50vh] overflow-y-auto">
              {showOPListModal.ops && showOPListModal.ops.length > 0 ? (
                showOPListModal.ops.map((opId, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-emerald-200 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:text-emerald-600 group-hover:border-emerald-100 shadow-sm transition-all">{idx + 1}</div>
                    <span className="font-mono text-sm font-black text-gray-800 tracking-tighter uppercase">{String(opId)}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs font-black text-gray-300 uppercase tracking-widest italic">OP Única / Sem Detalhes</p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 p-8 flex justify-end border-t border-gray-100">
              <button onClick={() => setShowOPListModal({ open: false, ops: [], title: '' })} className="px-12 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="fixed top-20 right-8 z-50 w-80 space-y-2 pointer-events-none text-left">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl animate-scaleIn pointer-events-auto border-2 border-white">
              <p className="text-xs font-black uppercase">PRODUTO EM FALTA!</p>
              <p className="text-[10px] font-bold opacity-90 truncate">OP: {alert.op} - {alert.produto}</p>
              <button onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))} className="mt-2 w-full py-2 bg-white/20 rounded-lg text-[9px] font-black uppercase">Ciente</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{kpi.value}</p>
            </div>
            <div className={`w-12 h-12 ${kpi.color} rounded-xl flex items-center justify-center text-xl shadow-lg shadow-gray-200`}>{kpi.icon}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-8">Volume de Separação Semanal</h3>
          <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
            <ResponsiveContainer width="99%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]} barSize={40}>
                  {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={index === 3 ? '#059669' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-emerald-900 text-white p-8 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-6"><span className="animate-pulse">✨</span> IA Insights</h3>
          {loadingAI ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-20">
              <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : insights && (
            <div className="space-y-6 overflow-y-auto max-h-[400px] custom-scrollbar">
              <p className="text-sm leading-relaxed text-emerald-50">{insights.resumo}</p>
              {insights.alertas?.map((alerta: string, idx: number) => (
                <div key={idx} className="bg-emerald-800/50 p-3 rounded-lg text-xs border border-emerald-700/50 flex gap-3">⚠️ {alerta}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mini Cards de Status de OPs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Status das OPs em Tempo Real
          </h3>
          <div className="flex items-center gap-4">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-tighter">Live Sync</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-left">
          {opStatusList
            .filter(op => op.data?.startsWith(dateFilter))
            .map((op, idx) => (
              <div key={`${op.id}-${idx}`} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${op.type === 'Separação' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                    {op.type}
                  </span>
                  <button
                    onClick={() => setShowOPListModal({ open: true, ops: op.ordens, title: op.name })}
                    className="w-5 h-5 flex items-center justify-center bg-gray-50 text-gray-300 rounded-md hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-gray-100"
                  >
                    <span className="text-[10px]">🔍</span>
                  </button>
                </div>
                <p className="text-xs font-black text-gray-900 mb-1 truncate">{op.name}</p>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${op.status === 'Finalizado' || op.status === 'Concluído' ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`}></div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">{op.status}</p>
                </div>
                {op.usuario && (
                  <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-[8px] font-black text-emerald-700">
                      {op.usuario.charAt(0)}
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 truncate">{op.usuario}</span>
                  </div>
                )}
              </div>
            ))}
          {opStatusList.filter(op => op.data?.startsWith(dateFilter)).length === 0 && (
            <div className="col-span-full py-12 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest border-2 border-dashed border-gray-100 rounded-3xl">
              Nenhuma OP ativa para esta data
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
