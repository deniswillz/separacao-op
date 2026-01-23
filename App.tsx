
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Separacao from './components/Separacao';
import Conferencia from './components/Conferencia';
import MatrizFilial from './components/MatrizFilial';
import Empenhos from './components/Empenhos';
import Enderecos from './components/Enderecos';
import Blacklist from './components/Blacklist';
import Historico from './components/Historico';
import Configuracoes from './components/Configuracoes';
import { User } from './types';

// Interface compartilhada para a BlackList
export interface BlacklistItem {
  id: string;
  codigo: string;
  naoSep: boolean;
  talvez: boolean;
  dataInclusao: string;
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  // Estado global da BlackList para compartilhamento entre módulos
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([
    {
      id: '1',
      codigo: 'MP0101000000164', // Código que existe no mock de separação para teste
      naoSep: false,
      talvez: true,
      dataInclusao: '2026-01-13'
    }
  ]);

  useEffect(() => {
    const saved = localStorage.getItem('nano_user');
    if (saved) {
      setUser(JSON.parse(saved));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.username === 'admin' && loginData.password === '12dfe13dfe') {
      const newUser: User = { id: 1, username: 'admin', nome: 'Administrador', role: 'admin', permissions: ['all'] };
      setUser(newUser);
      setIsAuthenticated(true);
      localStorage.setItem('nano_user', JSON.stringify(newUser));
      setError('');
    } else {
      setError('Credenciais inválidas. Tente novamente.');
    }
  };

  const handleVisitorLogin = () => {
    const visitorUser: User = {
      id: 'guest',
      username: 'visitor',
      nome: 'Visitante Nano',
      role: 'visitor',
      permissions: ['read']
    };
    setUser(visitorUser);
    setIsAuthenticated(true);
    localStorage.setItem('nano_user', JSON.stringify(visitorUser));
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('nano_user');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#004D33] p-6 relative overflow-hidden text-gray-900">
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="flex flex-col items-center mb-12 relative z-10 animate-fadeIn">
          <div className="flex items-center gap-4 mb-4">
            <img src="/logo.png" alt="Nano Pro Icon" className="w-24 h-24 object-contain brightness-0 invert" />
            <img src="/logo_text.png" alt="Nano Pro Text" className="h-10 object-contain brightness-0 invert" />
          </div>
          <p className="text-white text-sm font-black tracking-[0.3em] uppercase opacity-90 mt-2">Logística Industrial Inteligente</p>
        </div>

        <div className="w-full max-w-[420px] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 animate-scaleIn p-10">
          <form onSubmit={handleLogin} className="space-y-8">
            {error && <div className="bg-red-50 text-red-600 text-xs font-bold p-4 rounded-xl border border-red-100 text-center">{error}</div>}

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-[#8E9EAD] uppercase flex items-center gap-2 ml-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Login
                </label>
                <input
                  type="text"
                  required
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  placeholder="admin"
                  className="w-full px-6 py-5 bg-[#F0F4F8] border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#006B47]/20 focus:bg-white transition-all text-sm font-bold text-gray-700 placeholder-[#8E9EAD]"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-[#8E9EAD] uppercase flex items-center gap-2 ml-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Senha
                </label>
                <input
                  type="password"
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="••••••••••"
                  className="w-full px-6 py-5 bg-[#F0F4F8] border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#006B47]/20 focus:bg-white transition-all text-sm font-bold text-gray-700 placeholder-[#8E9EAD]"
                />
              </div>
            </div>

            <button type="submit" className="w-full py-5 bg-[#006B47] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-900/10 hover:bg-[#005538] transition-all active:scale-95 duration-150">
              Entrar
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleVisitorLogin}
                className="text-[11px] font-black text-[#8E9EAD] uppercase tracking-wider hover:text-[#006B47] transition-colors"
              >
                Modo Consulta (Visitante)
              </button>
            </div>
          </form>
        </div>

        <footer className="mt-20 relative z-10 animate-fadeIn text-center">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">
            Nano Pro © 2026 - Gestão Industrial de Alta Performance
          </p>
        </footer>
      </div>
    );
  }

  const renderContent = () => {
    const isVisitor = user?.role === 'visitor';

    // Lista de módulos permitidos para visitantes
    const visitorModules = ['dashboard', 'transferencia', 'historico'];

    if (isVisitor && !visitorModules.includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white rounded-3xl shadow-sm border border-gray-100 italic font-medium text-gray-400">
          Acesso restrito ao Modo Consulta.
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'enderecos': return <Enderecos />;
      case 'empenhos': return <Empenhos />;
      case 'separacao': return <Separacao blacklist={blacklist} />;
      case 'conferencia': return <Conferencia />;
      case 'transferencia': return <MatrizFilial user={user!} />;
      case 'blacklist': return <Blacklist items={blacklist} setItems={setBlacklist} />;
      case 'historico': return <Historico />;
      case 'configuracoes': return user?.role === 'admin' ? <Configuracoes /> : <Dashboard />;
      default: return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white rounded-3xl shadow-sm border border-gray-100">
          <div className="text-6xl">🚧</div>
          <div>
            <h3 className="text-xl font-bold text-gray-800">Em Desenvolvimento</h3>
            <p className="text-gray-500 text-sm">O módulo de <strong>{activeTab}</strong> está sendo migrado.</p>
          </div>
          <button onClick={() => setActiveTab('dashboard')} className="px-6 py-2 bg-emerald-700 text-white rounded-full text-sm font-bold">Voltar ao Dashboard</button>
        </div>
      );
    }
  };

  return (
    <Layout user={user!} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      <div className="max-w-7xl mx-auto">{renderContent()}</div>
    </Layout>
  );
};

export default App;
