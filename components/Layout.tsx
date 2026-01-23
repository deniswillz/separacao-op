
import React from 'react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, activeTab, setActiveTab }) => {
  const isAdmin = user.role === 'admin';

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
    { id: 'enderecos', name: 'Endereços', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'empenhos', name: 'Empenhos', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
    { id: 'separacao', name: 'Separação', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
    { id: 'conferencia', name: 'Conferência', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
    { id: 'transferencia', name: 'Transferência', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { id: 'blacklist', name: 'BlackList', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { id: 'historico', name: 'Histórico', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
    ...(isAdmin ? [{ id: 'configuracoes', name: 'Configurações', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> }] : [])
  ].filter(item => {
    if (user.role === 'visitor') {
      return ['dashboard', 'transferencia', 'historico'].includes(item.id);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Top Header Branding (Topo) */}
      <header className="h-16 bg-[#004D33] text-white flex items-center justify-between px-6 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Nano Pro Logo" className="w-10 h-10 object-contain brightness-0 invert" />
          <img src="/logo_text.png" alt="Nano Pro" className="h-4 object-contain brightness-0 invert" />
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">Usuário Nano</span>
            <span className="text-sm font-bold tracking-tight">{user.nome}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-black shadow-inner">
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={onLogout}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500 transition-all flex items-center justify-center group"
            title="Sair do Sistema"
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Refatorada */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 transition-all duration-300 ease-in-out md:translate-x-0 -translate-x-full fixed md:relative h-full">
          <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex items-center gap-3">
            <div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Navegação Principal</span>
          </div>

          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all relative group ${activeTab === item.id
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                  }`}
              >
                <div className={`${activeTab === item.id ? 'text-emerald-600' : 'text-gray-300 group-hover:text-gray-400'} transition-colors`}>
                  {item.icon}
                </div>
                <span className="uppercase tracking-wider">{item.name}</span>
                {activeTab === item.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-600 rounded-r-full shadow-[2px_0_8px_rgba(5,150,105,0.4)]" />
                )}
              </button>
            ))}
          </nav>

          <div className="p-6 border-t border-gray-100 bg-white">
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Versão 1.0.4</p>
              <p className="text-[8px] font-bold text-emerald-800">Sincronizado via Supabase</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-10 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.01)] shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">
                {menuItems.find(m => m.id === activeTab)?.name || 'Dashboard'}
              </h2>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-right hidden sm:block">
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Data do Sistema</p>
                <p className="text-xs font-black text-emerald-800">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-10 focus:outline-none custom-scrollbar bg-gray-50/50">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
