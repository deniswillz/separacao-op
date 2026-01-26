import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


const Dashboard: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(true);

  const [liveAlerts, setLiveAlerts] = useState<{ id: string, op: string, produto: string, motivo: string, timestamp: string }[]>([]);
  const [divergencias, setDivergencias] = useState<{ op: string, produto: string, responsavel: string, motivo: string }[]>([]);
  const [kpiData, setKpiData] = useState({
    pendingOps: 0,
    pendingSeparation: 0,
    pendingConferencia: 0,
    finalizedMonth: 0,
    inTransit: 0,
    totalDivergencias: 0,
    whData: [] as any[],
    ranking: [] as any[],
    stalledLots: [] as any[],
    dailyVolume: [] as any[]
  });
  const [opStatusList, setOpStatusList] = useState<{ id: string, type: 'Separação' | 'Conferência', status: string, usuario: string | null, data?: string, op_range?: string, itens?: any[] }[]>([]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [selectedLot, setSelectedLot] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsSyncing(true);

      const { data: sepData } = await supabase.from('separacao').select('*');
      const { data: confData } = await supabase.from('conferencia').select('*');
      const { data: histData } = await supabase.from('historico').select('*');

      // Normalização de Status para contagem precisa
      const isPending = (s: string) => {
        const norm = String(s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return norm === 'pendente' || norm === 'aguardando' || norm === 'em uso' || norm === 'em conferencia' || norm === 'em separacao';
      };

      const pendingSep = sepData?.filter(d => isPending(d.status)).length || 0;
      const pendingConf = confData?.filter(d => isPending(d.status)).length || 0;
      const pending = pendingSep + pendingConf;

      // Finalizadas no Mês (do histórico)
      const now = new Date();
      const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const finalizedMonthCount = histData?.filter(h => (h.data_finalizacao || h.created_at) >= firstDayMonth).length || 0;

      // Itens em Trânsito (TEA no histórico sem status Concluido no último passo)
      const inTransitCount = histData?.filter(h => {
        if (h.armazem !== 'TEA') return false;
        const lastStep = (h.itens || [])[(h.itens || []).length - 1];
        return lastStep?.status !== 'Concluido';
      }).length || 0;

      // Ranking de Produtividade (Top 3)
      const userStats: Record<string, number> = {};
      histData?.forEach(h => {
        const separador = h.separador || h.usuario_atual || 'N/A';
        const conferente = h.conferente || h.responsavel_conferencia || 'N/A';
        if (separador && separador !== 'N/A') userStats[separador] = (userStats[separador] || 0) + 1;
        if (conferente && conferente !== 'N/A') userStats[conferente] = (userStats[conferente] || 0) + 1;
      });

      const ranking = Object.entries(userStats)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      // Volume por Armazém (Donut)
      const whStats: Record<string, number> = {};
      [...(sepData || []), ...(confData || [])].forEach(item => {
        if (item.armazem) whStats[item.armazem] = (whStats[item.armazem] || 0) + 1;
      });
      const whData = Object.entries(whStats).map(([name, value]) => ({ name, value }));

      const bottleneckTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const stalledLots = [...(sepData || []), ...(confData || [])]
        .filter(item => isPending(item.status) && (item.updated_at || item.data_criacao || item.created_at) < bottleneckTime)
        .map(item => ({
          id: item.id,
          op: String(item.id).slice(0, 8),
          time: new Date(item.updated_at || item.data_criacao || item.created_at).toLocaleTimeString('pt-BR'),
          type: sepData?.find(s => s.id === item.id) ? 'Separação' : 'Conferência'
        }));

      const dailyMap: Record<string, number> = {};
      histData?.forEach(h => {
        const date = (h.data_finalizacao || h.created_at || '').split('T')[0];
        if (date) dailyMap[date] = (dailyMap[date] || 0) + 1;
      });
      const dailyVolume = Object.entries(dailyMap)
        .map(([name, value]) => ({ name: name.split('-').slice(1).reverse().join('/'), value }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(-7);

      const currentDivergencias: any[] = [];
      (confData || []).forEach(conf => {
        const isFinalized = conf.status === 'Finalizado' || conf.status === 'Finalizada';
        if (!isFinalized) {
          (conf.itens || []).forEach((item: any) => {
            (item.composicao || []).forEach((comp: any) => {
              if (comp.falta_conf) {
                currentDivergencias.push({
                  op: comp.op,
                  produto: `${item.codigo} - ${item.descricao}`,
                  responsavel: conf.responsavel_conferencia || 'Não atribuído',
                  motivo: comp.motivo_divergencia || 'Não especificado'
                });
              }
            });
          });
        }
      });

      setDivergencias(currentDivergencias);
      setKpiData({
        pendingOps: pending,
        pendingSeparation: pendingSep,
        pendingConferencia: pendingConf,
        finalizedMonth: finalizedMonthCount,
        inTransit: inTransitCount,
        totalDivergencias: currentDivergencias.length,
        whData,
        ranking,
        stalledLots,
        dailyVolume
      });

      const getOpRange = (item: any) => {
        const firstItem = (item.itens || [])[0] || {};
        return (firstItem.metadata?.op_range || item.op_range) || item.nome || item.documento || String(item.id).slice(0, 8);
      };

      const combined = [
        ...(sepData || []).map(d => ({
          id: d.id,
          type: 'Separação' as const,
          status: d.status,
          usuario: d.usuario_atual,
          data: d.data_criacao || d.created_at || d.updated_at,
          op_range: getOpRange(d),
          itens: d.itens
        })),
        ...(confData || []).map(d => ({
          id: d.id,
          type: 'Conferência' as const,
          status: d.status,
          usuario: d.responsavel_conferencia,
          data: d.data_conferencia || d.created_at || d.updated_at,
          op_range: getOpRange(d),
          itens: d.itens
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
      const { op, produto, motivo } = e.detail;
      const newAlert = {
        id: Math.random().toString(36).substr(2, 9),
        op,
        produto,
        motivo: motivo || 'Divergência não especificada',
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      setLiveAlerts(prev => [newAlert, ...prev].slice(0, 5));
      if (audioRef.current) audioRef.current.play().catch(() => { });
      fetchDashboardData(); // Refresh to update persistent list
    };

    window.addEventListener('falta-detectada', handleFaltaAlert);



    return () => {
      window.removeEventListener('falta-detectada', handleFaltaAlert);
      supabase.removeChannel(channel);
    };
  }, []);

  if (isSyncing) {
    return <Loading message="Sincronizando Dashboard..." />;
  }


  const kpis = [
    { label: 'OPs Pendentes', value: kpiData.pendingOps.toString().padStart(2, '0'), color: 'bg-orange-500', icon: '⏳' },
    { label: 'Finalizadas (Mês)', value: kpiData.finalizedMonth.toString().padStart(2, '0'), color: 'bg-emerald-600', icon: '✅' },
    { label: 'Itens em Trânsito', value: kpiData.inTransit.toString().padStart(2, '0'), color: 'bg-blue-600', icon: '🚚' },
    { label: 'Faltas Críticas', value: kpiData.totalDivergencias.toString().padStart(2, '0'), color: 'bg-red-600', icon: '🚨' },
  ];

  const chartData = [
    { name: 'Seg', valor: 45 }, { name: 'Ter', valor: 52 }, { name: 'Qua', valor: 38 },
    { name: 'Qui', valor: 65 }, { name: 'Sex', valor: 48 }, { name: 'Sáb', valor: 20 },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {liveAlerts.length > 0 && (
        <div className="fixed top-20 right-8 z-[100] w-80 space-y-2 pointer-events-none">
          {liveAlerts.map((alert) => (
            <div key={alert.id} className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl animate-scaleIn pointer-events-auto border-2 border-white">
              <p className="text-xs font-black uppercase">🚨 PRODUTO EM FALTA!</p>
              <p className="text-[10px] font-bold opacity-90 truncate">OP: {alert.op} - {alert.produto}</p>
              <div className="mt-2 text-[9px] bg-white/10 p-2 rounded-lg font-black uppercase leading-tight italic">
                "{alert.motivo}"
              </div>
              <button onClick={() => setLiveAlerts(prev => prev.filter(a => a.id !== alert.id))} className="mt-2 w-full py-2 bg-white/20 rounded-lg text-[9px] font-black uppercase">Ciente</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className={`bg-[var(--bg-secondary)] p-6 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)] flex items-center justify-between ${idx === 3 && kpiData.totalDivergencias > 0 ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
            <div>
              <p className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{kpi.label}</p>
              <p className="text-3xl font-extrabold text-[var(--text-primary)] mt-1">{idx === 3 ? kpiData.totalDivergencias.toString().padStart(2, '0') : kpi.value}</p>
            </div>
            <div className={`w-12 h-12 ${kpi.color} rounded-xl flex items-center justify-center text-xl shadow-lg shadow-black/5`}>{kpi.icon}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lado Esquerdo: Volume Diário */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)] flex flex-col h-[400px]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter">📦 OPs Entregues por Dia</h3>
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Volume de finalizações nos últimos 7 dias</p>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl">
                <span className="text-xl">📊</span>
                <span className="text-xs font-black text-emerald-600 uppercase">Performance</span>
              </div>
            </div>

            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpiData.dailyVolume || []} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 900 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 900 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-inner)', opacity: 0.4 }}
                    contentStyle={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '2px solid var(--border-light)',
                      borderRadius: '1rem',
                      fontSize: '10px',
                      fontWeight: 900,
                      textTransform: 'uppercase'
                    }}
                  />
                  <Bar dataKey="value" fill="url(#barGradient)" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição por Armazém */}
          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)]">
            <h3 className="text-sm font-black text-[var(--text-primary)] mb-6 uppercase tracking-widest">📍 Volume Ativo por Armazém</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {(kpiData.whData || []).map((wh: any) => (
                <div key={wh.name} className="flex flex-col items-center gap-2 p-4 bg-[var(--bg-inner)] rounded-2xl border border-[var(--border-light)] min-w-[100px]">
                  <p className="text-lg font-black text-[var(--text-primary)]">{wh.value}</p>
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">Setor {wh.name}</p>
                </div>
              ))}
              {(kpiData.whData || []).length === 0 && <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase italic">Aguardando dados...</p>}
            </div>
          </div>
        </div>

        {/* Lado Direito: Alertas e Gargalos */}
        <div className="space-y-8">
          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)] space-y-6">
            <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-2">
              ⚠️ Alerta de Gargalo
            </h3>
            <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
              {(kpiData.stalledLots || []).length > 0 ? (kpiData.stalledLots || []).map((st: any) => (
                <div key={st.id} className="p-4 bg-orange-50 border border-orange-100 rounded-xl relative overflow-hidden group animate-pulse">
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-orange-600 uppercase italic">Atraso {'>'} 2 horas</p>
                      <p className="text-xs font-bold text-[var(--text-primary)] mt-1">OP {st.op}</p>
                      <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Entrada: {st.time}</p>
                    </div>
                    <span className="text-[9px] font-black bg-white px-2 py-1 rounded-lg shadow-sm border border-orange-100">{st.type}</span>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-30">
                  <span className="text-3xl">🚀</span>
                  <p className="text-[10px] font-black uppercase">Operação em Alta Velocidade</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)] space-y-6">
            <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tighter">🚨 Divergências Ativas</h3>
            <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
              {divergencias.length > 0 ? divergencias.map((div, i) => (
                <div key={i} className="p-4 bg-red-50 border border-red-100 rounded-xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-black text-red-600 uppercase">OP: {div.op}</p>
                      <p className="text-xs font-bold text-[var(--text-primary)] mt-1">{div.produto}</p>
                      <p className="text-[8px] font-bold text-red-400 mt-1 uppercase truncate max-w-[150px]">MOTIVO: {div.motivo}</p>
                    </div>
                    <span className="text-xl">⚠️</span>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-30">
                  <span className="text-3xl">🛡️</span>
                  <p className="text-[10px] font-black uppercase">Faltas não detectadas</p>
                </div>
              )}
            </div>
          </div>
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
              className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500 text-[var(--text-primary)]"
            />
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-tighter">Live Sync</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Card Resumo: Pendente Separação */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-5 rounded-[2rem] shadow-lg flex flex-col justify-between items-center text-center group hover:scale-[1.02] transition-all border-b-4 border-blue-800">
            <span className="text-2xl mb-2">📦</span>
            <div className="space-y-0.5">
              <p className="text-[24px] font-black text-white leading-none">{kpiData.pendingSeparation}</p>
              <p className="text-[8px] font-black text-blue-100 uppercase tracking-widest opacity-80">Pendente Separação</p>
            </div>
          </div>

          {/* Card Resumo: Pendente Conferência */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-5 rounded-[2rem] shadow-lg flex flex-col justify-between items-center text-center group hover:scale-[1.02] transition-all border-b-4 border-orange-700">
            <span className="text-2xl mb-2">🔍</span>
            <div className="space-y-0.5">
              <p className="text-[24px] font-black text-white leading-none">{kpiData.pendingConferencia}</p>
              <p className="text-[8px] font-black text-orange-100 uppercase tracking-widest opacity-80">Pendente Conferência</p>
            </div>
          </div>

          {opStatusList
            .filter(op => (op as any).data?.startsWith(dateFilter))
            .map((op, idx) => {
              const borderClass = op.status === 'Finalizado' || op.status === 'Finalizada' ? 'border-emerald-500' :
                op.usuario ? 'border-blue-500' : 'border-[var(--border-light)]';
              return (
                <div key={`${op.id}-${idx}`} className={`bg-[var(--bg-secondary)] border-2 ${borderClass} p-5 rounded-[2rem] shadow-[var(--shadow-sm)] hover:shadow-xl hover:scale-[1.02] transition-all relative overflow-hidden group`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm ${op.type === 'Separação' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>
                      {op.type}
                    </span>
                    <button
                      onClick={() => { setSelectedLot(op); setShowBreakdown(true); }}
                      className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--bg-inner)] border border-[var(--border-light)] hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all active:scale-95 shadow-sm"
                      title="Ver Relação de OPs"
                    >
                      <span className="text-[14px]">🔍</span>
                    </button>
                  </div>

                  <div className="space-y-1 mb-4">
                    <p className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-tight leading-tight">
                      {op.op_range || `OP ${op.id.toString().slice(0, 6)}`}
                    </p>

                  </div>

                  <div className="flex items-center gap-2.5 bg-[var(--bg-inner)] p-3 rounded-2xl">
                    <div className={`w-2 h-2 rounded-full ${op.status === 'Finalizado' || op.status === 'Finalizada' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-orange-500 animate-pulse'}`}></div>
                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-tighter">{op.status}</p>
                  </div>

                  {op.usuario && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-light)] flex items-center gap-3">
                      <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-[10px] font-black text-white shadow-sm">
                        {op.usuario.charAt(0)}
                      </div>
                      <span className="text-[10px] font-black text-[var(--text-muted)] uppercase truncate tracking-tighter">{op.usuario}</span>
                    </div>
                  )}
                </div>
              );
            })}
          {opStatusList.length === 0 && (
            <div className="w-full py-8 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest">
              Nenhuma OP ativa no momento
            </div>
          )}
        </div>
      </div>

      {/* BreakDown Modal */}
      {showBreakdown && selectedLot && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBreakdown(false)}></div>
          <div className="bg-[#f8f9fa] w-full max-w-sm rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-scaleIn border border-white">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter text-[#1a1c1e] leading-none">RELAÇÃO DE OPs</h3>
                  <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest">{selectedLot.op_range}</p>
                </div>
                <button
                  onClick={() => setShowBreakdown(false)}
                  className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-2xl flex items-center justify-center text-gray-400 transition-all shadow-sm"
                >
                  ✕
                </button>
              </div>

              <div className="h-px bg-gray-100 w-full mb-8"></div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {/* Entry: Todas OPs (Resumo) */}
                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center group hover:scale-[1.02] transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📦</span>
                    <span className="text-sm font-black text-emerald-600 uppercase tracking-tight">Todas OPs</span>
                  </div>
                  <span className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                    SELECIONADO
                  </span>
                </div>

                {/* List of Individual OPs extracted from items */}
                {Array.from(new Set((selectedLot.itens || []).map((i: any) => i.op))).map((opId: any, idx) => {
                  const isDone = selectedLot.status === 'Finalizado' || selectedLot.status === 'Finalizada';
                  return (
                    <div key={idx} className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center group hover:scale-[1.02] transition-all">
                      <span className="text-sm font-black text-[#1a1c1e] uppercase tracking-tight">OP {String(opId).slice(-4)}</span>
                      <span className={`${isDone ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'} px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-colors`}>
                        {isDone ? 'CONCLUÍDO' : 'PENDENTE'}
                      </span>
                    </div>
                  );
                })}

                {(selectedLot.itens || []).length === 0 && (
                  <div className="py-10 text-center text-[10px] font-black text-gray-300 uppercase italic">
                    Composição não encontrada
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 pt-4">
              <button
                onClick={() => setShowBreakdown(false)}
                className="w-full py-5 bg-[#1a1c1e] rounded-[1.5rem] text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all"
              >
                FECHAR LISTA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
