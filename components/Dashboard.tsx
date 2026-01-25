import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { supabase } from '../services/supabaseClient';
import Loading from './Loading';


const Dashboard: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(true);

  const [liveAlerts, setLiveAlerts] = useState<{ id: string, op: string, produto: string, motivo: string, timestamp: string }[]>([]);
  const [divergencias, setDivergencias] = useState<{ op: string, produto: string, responsavel: string, motivo: string }[]>([]);
  const [kpiData, setKpiData] = useState({ pendingOps: 0, finalizedMonth: 0, inTransit: 0, totalDivergencias: 0 });
  const [opStatusList, setOpStatusList] = useState<{ id: string, type: 'Separação' | 'Conferência', status: string, usuario: string | null }[]>([]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsSyncing(true);

      const { data: sepData } = await supabase.from('separacao').select('id, status, usuario_atual, data_criacao');
      const { data: confData } = await supabase.from('conferencia').select('id, status, responsavel_conferencia, data_conferencia, itens');

      const pending = (sepData?.filter(d => d.status?.toLowerCase() === 'pendente' || d.status?.toLowerCase() === 'em_separacao').length || 0) +
        (confData?.filter(d => d.status?.toLowerCase() === 'pendente' || d.status?.toLowerCase() === 'aguardando' || d.status?.toLowerCase() === 'em_conferencia').length || 0);

      const finalized = (sepData?.filter(d => d.status?.toLowerCase() === 'finalizado' || d.status?.toLowerCase() === 'concluido').length || 0) +
        (confData?.filter(d => d.status?.toLowerCase() === 'finalizado' || d.status?.toLowerCase() === 'concluido').length || 0);

      // Extract current divergences from conferences (Granular per OP)
      const currentDivergencias: any[] = [];
      (confData || []).forEach(conf => {
        if (conf.status !== 'Finalizado') {
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
            // Legacy check just in case
            if (item.falta && (!item.composicao || item.composicao.length === 0)) {
              currentDivergencias.push({
                op: item.op,
                produto: `${item.codigo} - ${item.descricao}`,
                responsavel: conf.responsavel_conferencia || 'Não atribuído',
                motivo: item.motivo_divergencia || 'Não especificado'
              });
            }
          });
        }
      });

      setDivergencias(currentDivergencias);

      setKpiData({
        pendingOps: pending,
        finalizedMonth: finalized,
        inTransit: 0,
        totalDivergencias: currentDivergencias.length
      });

      // Transformar para o formato dos mini cards e filtrar por data
      const combined = [
        ...(sepData || []).map(d => ({ id: d.id, type: 'Separação' as const, status: d.status, usuario: d.usuario_atual, data: d.data_criacao })),
        ...(confData || []).map(d => ({ id: d.id, type: 'Conferência' as const, status: d.status, usuario: d.responsavel_conferencia, data: d.data_conferencia }))
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
        <div className="lg:col-span-2 bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)]">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-8">Volume de Separação Semanal</h3>
          <div className="h-[300px] min-h-[300px] w-full overflow-hidden">
            <ResponsiveContainer width="99%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'var(--bg-inner)' }} contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)', borderRadius: '12px', border: 'none', color: 'var(--text-primary)' }} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]} barSize={40}>
                  {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={index === 3 ? '#059669' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] p-8 rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border-light)] space-y-6">
          <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-tighter">🚨 Divergências em Aberto</h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {divergencias.length > 0 ? divergencias.map((div, i) => (
              <div key={i} className="p-4 bg-red-50 border border-red-100 rounded-xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-red-600 uppercase">OP: {div.op}</p>
                    <p className="text-xs font-bold text-[var(--text-primary)] mt-1">{div.produto}</p>
                    <p className="text-[9px] font-bold text-red-400 mt-1 uppercase italic italic tracking-tighter">MOTIVO: {div.motivo}</p>
                    <p className="text-[9px] font-bold text-gray-400 mt-2">Conferente: {div.responsavel}</p>
                  </div>
                  <span className="text-xl">⚠️</span>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-30">
                <span className="text-3xl">🛡️</span>
                <p className="text-[10px] font-black uppercase">Nenhuma divergência detectada</p>
              </div>
            )}
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
          {opStatusList
            .filter(op => (op as any).data?.startsWith(dateFilter))
            .map((op, idx) => {
              const borderClass = op.status === 'Finalizado' ? 'border-emerald-500' :
                op.usuario ? 'border-blue-500' : 'border-[var(--border-light)]';
              return (
                <div key={`${op.id}-${idx}`} className={`bg-[var(--bg-secondary)] border-2 ${borderClass} p-4 rounded-2xl shadow-[var(--shadow-sm)] hover:shadow-md transition-shadow`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${op.type === 'Separação' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                      {op.type}
                    </span>
                    <span className="text-[10px] font-black text-gray-300">#{op.id.toString().slice(-4)}</span>
                  </div>
                  <p className="text-xs font-black text-[var(--text-primary)] mb-1 truncate">OP {op.id.toString().slice(0, 6)}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${op.status === 'Finalizado' ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`}></div>
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{op.status}</p>
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
              );
            })}
          {opStatusList.length === 0 && (
            <div className="w-full py-8 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest">
              Nenhuma OP ativa no momento
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
