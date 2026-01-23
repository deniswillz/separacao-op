
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

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('nano_user');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-900 p-6 relative overflow-hidden text-gray-900">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-400 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-300 rounded-full blur-3xl"></div>
        </div>

        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 animate-scaleIn">
          <div className="bg-emerald-700 p-8 text-center">
            <div className="w-20 h-20 bg-white/20 rounded-2xl mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4 backdrop-blur-md">NP</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">NANO PRO</h1>
            <p className="text-emerald-100 text-xs font-semibold tracking-widest uppercase mt-1">Logística Inteligente</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-10 space-y-6">
            {error && <div className="bg-red-50 text-red-600 text-xs font-bold p-4 rounded-xl border border-red-100 text-center">{error}</div>}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Usuário</label>
                <input
                  type="text"
                  required
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  placeholder="Seu login"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Senha</label>
                <input
                  type="password"
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                />
              </div>
            </div>
            <button type="submit" className="w-full py-4 bg-emerald-700 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-800 transition-colors shadow-lg shadow-emerald-100 active:scale-95 duration-150">
              Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  const renderContent = () => {
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
