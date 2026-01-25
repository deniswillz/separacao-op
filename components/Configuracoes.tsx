import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../services/supabaseClient';
import { useAlert } from './AlertContext';


interface SystemUser extends User {
  criadoEm: string;
}

const mockUsers: SystemUser[] = [
  { id: '1', username: 'fernando', nome: 'Fernando', role: 'user', permissions: ['8/9'], criadoEm: '2026-01-12T22:00:14' },
  { id: '2', username: 'daniel', nome: 'Daniel', role: 'user', permissions: ['4/9'], criadoEm: '2026-01-13T07:27:00' },
  { id: '3', username: 'admin', nome: 'Administrador', role: 'admin', permissions: ['Todos'], criadoEm: '2026-01-11T23:18:10' },
  { id: '4', username: 'renan', nome: 'Renan', role: 'admin', permissions: ['Todos'], criadoEm: '2026-01-11T23:38:48' },
  { id: '5', username: 'denis', nome: 'Denis', role: 'admin', permissions: ['Todos'], criadoEm: '2026-01-12T00:22:35' },
  { id: '6', username: 'felipe', nome: 'Felipe', role: 'user', permissions: ['3/9'], criadoEm: '2026-01-12T16:04:44' },
  { id: '7', username: 'johnny', nome: 'Johnny', role: 'user', permissions: ['3/9'], criadoEm: '2026-01-12T16:05:28' },
];

const Configuracoes: React.FC = () => {
  const { showAlert } = useAlert();
  const [users, setUsers] = useState<User[]>([]);

  const [isSyncing, setIsSyncing] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    nome: '',
    senha: '',
    confirmarSenha: '',
    role: 'user',
    permissions: {
      dashboard: true,
      enderecos: false,
      empenhos: false,
      blacklist: false,
      separacao: true,
      conferencia: false,
      historico: false
    }
  });

  useEffect(() => {
    const fetchUsers = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase.from('usuarios').select('*');
      if (data) setUsers(data as any);
      setIsSyncing(false);
    };
    fetchUsers();

    const channel = supabase.channel('users-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, fetchUsers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDelete = async (username: string) => {
    if (username === 'admin') return;
    if (confirm(`Deseja realmente excluir o usuário ${username}?`)) {
      const { error } = await supabase.from('usuarios').delete().eq('username', username);
      if (error) showAlert('Erro ao excluir: ' + error.message, 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!newUser.username || !newUser.nome || !newUser.senha) return;
    if (newUser.senha !== newUser.confirmarSenha) {
      showAlert('Senhas não conferem', 'warning');
      return;
    }

    const { error } = await supabase.from('usuarios').insert([{
      username: newUser.username,
      nome: newUser.nome,
      senha: newUser.senha,
      role: newUser.role,
      permissions: JSON.stringify(newUser.permissions),
      criadoEm: new Date().toISOString()
    }]);

    if (error) {
      showAlert('Erro ao salvar usuário: ' + error.message, 'error');
    } else {
      setIsModalOpen(false);
      setNewUser({
        username: '',
        nome: '',
        senha: '',
        confirmarSenha: '',
        role: 'user',
        permissions: {
          dashboard: true,
          enderecos: false,
          empenhos: false,
          blacklist: false,
          separacao: true,
          conferencia: false,
          historico: false
        }
      });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Modal Novo Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl overflow-hidden shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="bg-[#006B47] px-8 py-5 flex justify-between items-center text-white">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-widest">Novo Perfil de Acesso</h3>
                <p className="text-emerald-100 text-[9px] font-bold uppercase opacity-80">Segurança e Permissões</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all text-xs">✕</button>
            </div>

            <form className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Username</label>
                  <input type="text" placeholder="ex: danilo_sep" className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-50 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" placeholder="Nome do Colaborador" className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-50 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
                  <input type="password" placeholder="••••••••" className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-50 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                  <input type="password" placeholder="••••••••" className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-50 focus:bg-white transition-all" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nível de Hierarquia</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewUser({ ...newUser, role: 'user' })} className={`py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${newUser.role === 'user' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-gray-100 text-gray-300'}`}>Operador</button>
                  <button type="button" onClick={() => setNewUser({ ...newUser, role: 'admin' })} className={`py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${newUser.role === 'admin' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-100 text-gray-300'}`}>Administrador</button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-50">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-4 block">Módulos Autorizados</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'dashboard', label: 'Home', icon: '🏠' },
                    { key: 'enderecos', label: 'End.', icon: '📍' },
                    { key: 'empenhos', label: 'Emp.', icon: '📦' },
                    { key: 'blacklist', label: 'Black', icon: '❌' },
                    { key: 'separacao', label: 'Sep.', icon: '✅' },
                    { key: 'conferencia', label: 'Conf.', icon: '🔍' },
                    { key: 'historico', label: 'Hist.', icon: '📚' },
                  ].map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 bg-gray-50 px-3 py-2.5 rounded-xl border border-transparent transition-all cursor-pointer hover:bg-white hover:border-emerald-200 group">
                      <input type="checkbox" className="w-4 h-4 rounded text-[#006B47] cursor-pointer" defaultChecked={newUser.permissions[perm.key as keyof typeof newUser.permissions]} />
                      <span className="text-[8px] font-black text-gray-500 uppercase flex items-center gap-1 group-hover:text-emerald-700">{perm.icon} {perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </form>

            <div className="bg-gray-50 px-8 py-6 flex justify-end gap-3 border-t border-gray-100">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 bg-white border border-gray-200 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Sair</button>
              <button type="submit" className="px-8 py-3 bg-[#006B47] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-50">Confirmar Cadastro</button>
            </div>
          </div>
        </div>
      )}

      {/* Header Compacto */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Configurações</h1>
          <p className="text-gray-400 font-bold text-[9px] uppercase tracking-[0.2em] mt-0.5">Gestão e Manutenção do Ecossistema</p>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Base de Dados Supabase Conectada</span>
        </div>
      </div>

      {/* Grade de Utilitários em Mini-Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <button onClick={() => setIsModalOpen(true)} className="col-span-1 md:col-span-1 bg-[#006B47] p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#004D33] transition-all shadow-lg shadow-emerald-50 group">
          <span className="text-xl group-hover:scale-110 transition-transform">👤</span>
          <span className="text-[8px] font-black text-emerald-50 uppercase tracking-widest">Novo Usuário</span>
        </button>

        <button className="bg-white p-4 rounded-[1.5rem] border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
          <span className="text-xl">📤</span>
          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Exportar</span>
        </button>

        <button className="bg-white p-4 rounded-[1.5rem] border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
          <span className="text-xl">📥</span>
          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Importar</span>
        </button>

        <div className="hidden lg:block w-px h-full bg-gray-100 mx-auto"></div>

        <button className="bg-[#F2A516]/10 border border-[#F2A516]/20 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#F2A516]/20 transition-all group">
          <span className="text-xl group-hover:rotate-12 transition-transform">🔄</span>
          <span className="text-[8px] font-black text-[#F2A516] uppercase tracking-widest">Backup</span>
        </button>

        <button className="bg-[#F2A516]/10 border border-[#F2A516]/20 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#F2A516]/20 transition-all group">
          <span className="text-xl group-hover:scale-90 transition-transform">🚪</span>
          <span className="text-[8px] font-black text-[#F2A516] uppercase tracking-widest">Deslogar</span>
        </button>

        <button className="bg-red-50 border border-red-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-red-100 transition-all group">
          <span className="text-xl group-hover:animate-pulse transition-transform">🗑️</span>
          <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">Resetar</span>
        </button>
      </div>

      {/* Tabela de Usuários Otimizada */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">
                <th className="px-8 py-5">Perfil</th>
                <th className="px-6 py-5">Nome</th>
                <th className="px-6 py-5 text-center">Nível</th>
                <th className="px-6 py-5 text-center">Permissão</th>
                <th className="px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.username} className="hover:bg-gray-50/30 transition-all group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${user.role === 'admin' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-black text-gray-800 text-xs tracking-tight uppercase leading-none">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{user.nome}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-md text-[7px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-300'}`}>
                      {user.role === 'admin' ? 'Master' : 'Opera'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-[9px] font-bold border border-gray-100">
                      {user.permissions[0]}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {user.username !== 'admin' && (
                        <>
                          <button className="p-2 bg-white border border-gray-100 text-emerald-600 rounded-lg hover:bg-emerald-50">✏️</button>
                          <button onClick={() => handleDelete(user.username)} className="p-2 bg-white border border-gray-100 text-red-500 rounded-lg hover:bg-red-50">🗑️</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50/50 px-8 py-4 flex justify-between items-center border-t border-gray-100">
          <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Base de Dados: Local Storage + Supabase Sync</p>
          <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Total: {users.length}</p>
        </div>
      </div>
    </div>
  );
};

export default Configuracoes;
