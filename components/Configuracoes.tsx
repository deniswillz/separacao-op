import React, { useState, useEffect, useRef } from 'react';
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
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const initialUserState = {
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
      transferencia: false, // TEA
      historico: false
    }
  };

  const [newUser, setNewUser] = useState(initialUserState);

  const fetchUsers = async () => {
    setIsSyncing(true);
    const { data, error } = await supabase.from('usuarios').select('*');
    if (data) {
      setUsers(data.map((u: any) => ({
        ...u,
        permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions
      })));
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    fetchUsers();
    const channel = supabase.channel('users-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, fetchUsers)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleDelete = async (username: string) => {
    if (username === 'admin') return;
    if (confirm(`Deseja realmente excluir o usuário ${username}?`)) {
      const { error } = await supabase.from('usuarios').delete().eq('username', username);
      if (error) showAlert('Erro ao excluir: ' + error.message, 'error');
      else showAlert('Usuário excluído com sucesso!', 'success');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user.username);
    setNewUser({
      username: user.username,
      nome: user.nome,
      senha: '', // Don't show password
      confirmarSenha: '',
      role: user.role,
      permissions: (user.permissions as any) || initialUserState.permissions
    });
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newUser.username || !newUser.nome) {
      showAlert('Preencha os campos obrigatórios', 'warning');
      return;
    }

    if (!editingUser && !newUser.senha) {
      showAlert('Senha é obrigatória para novos usuários', 'warning');
      return;
    }

    if (newUser.senha && newUser.senha !== newUser.confirmarSenha) {
      showAlert('Senhas não conferem', 'warning');
      return;
    }

    const userData: any = {
      username: newUser.username,
      nome: newUser.nome,
      role: newUser.role,
      permissions: JSON.stringify(newUser.permissions)
    };

    if (newUser.senha) {
      userData.password = newUser.senha; // Using 'password' column as seen in App.tsx
    }

    let error;
    if (editingUser) {
      const { error: err } = await supabase.from('usuarios').update(userData).eq('username', editingUser);
      error = err;
    } else {
      // Supabase uses created_at by default, 'criadoEm' does not exist in the schema
      const { error: err } = await supabase.from('usuarios').insert([userData]);
      error = err;
    }

    if (error) {
      showAlert('Erro ao salvar usuário: ' + error.message, 'error');
    } else {
      showAlert(editingUser ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
      setIsModalOpen(false);
      setEditingUser(null);
      setNewUser(initialUserState);
      fetchUsers();
    }
  };

  // 📤 EXPORTAR BACKUP JSON (Local)
  const handleExportLocal = async () => {
    try {
      const tables = ['usuarios', 'enderecos', 'separacao', 'conferencia', 'historico', 'blacklist'];
      const backup: any = {};

      for (const table of tables) {
        const { data } = await supabase.from(table).select('*');
        backup[table] = data || [];
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NANO_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      showAlert('Backup exportado com sucesso!', 'success');
    } catch (e: any) {
      showAlert('Erro ao exportar: ' + e.message, 'error');
    }
  };

  // 🔄 BACKUP MANUAL (Supabase)
  const handleSupabaseBackup = async () => {
    setIsSyncing(true);
    try {
      const tables = ['usuarios', 'enderecos', 'separacao', 'conferencia', 'historico', 'blacklist'];
      const backupData: any = {};

      for (const table of tables) {
        const { data } = await supabase.from(table).select('*');
        backupData[table] = data || [];
      }

      const { error } = await supabase.from('backups').insert([{
        data: new Date().toISOString(),
        backup_json: JSON.stringify(backupData),
        responsavel: 'admin'
      }]);

      if (error) throw error;
      showAlert('Backup manual salvo no Supabase!', 'success');
    } catch (e: any) {
      showAlert('Aviso: Tabela "backups" não encontrada ou erro ao salvar. Use a Exportação JSON.', 'warning');
    } finally {
      setIsSyncing(false);
    }
  };

  // 🔄 RESTAURAR BACKUP MANUAL (Supabase)
  const handleRestoreBackup = async () => {
    if (!confirm('Deseja restaurar o backup mais recente do servidor? Isso substituirá dados atuais.')) return;

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.from('backups').select('*').order('id', { ascending: false }).limit(1).single();
      if (error || !data) throw new Error('Nenhum backup encontrado no servidor.');

      const backup = JSON.parse(data.backup_json);
      for (const table in backup) {
        if (Array.isArray(backup[table]) && backup[table].length > 0) {
          await supabase.from(table).upsert(backup[table]);
        }
      }
      showAlert('Backup restaurado do servidor com sucesso!', 'success');
      fetchUsers();
    } catch (e: any) {
      showAlert('Erro ao restaurar: ' + e.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // 📥 IMPORTAR BACKUP JSON (Local)
  const handleImportLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('ATENÇÃO: A importação pode duplicar ou sobrescrever dados. Deseja continuar?')) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const backup = JSON.parse(evt.target?.result as string);
        for (const table in backup) {
          if (Array.isArray(backup[table]) && backup[table].length > 0) {
            // Using upsert if possible, or insert
            const { error } = await supabase.from(table).upsert(backup[table]);
            if (error) console.error(`Erro ao importar ${table}:`, error);
          }
        }
        showAlert('Backup importado com sucesso!', 'success');
        fetchUsers();
      } catch (err: any) {
        showAlert('Erro ao importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  // 🗑️ RESETAR SISTEMA
  const handleResetSystem = async () => {
    if (!confirm('PERIGO: Esta ação apagará TODOS os dados operacionais. Confirmar reset total?')) return;
    if (!confirm('ÚLTIMO AVISO: Dashboard, Endereços, Empenhos, Separação, Conferência, TEA, BlackList e Histórico serão limpos. Prosseguir?')) return;

    const tables = ['enderecos', 'separacao', 'conferencia', 'historico', 'blacklist'];
    try {
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq('id', '000000');
        if (error) console.error(`Erro ao resetar ${table}:`, error);
      }
      showAlert('Sistema resetado com sucesso!', 'success');
      window.location.reload();
    } catch (e: any) {
      showAlert('Erro ao resetar: ' + e.message, 'error');
    }
  };

  // 🚪 DESLOGAR TODOS
  const handleLogoutAll = () => {
    if (confirm('Deseja deslogar e limpar a sessão atual?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const togglePermission = (key: string) => {
    setNewUser(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !((prev.permissions as any)[key])
      }
    }));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportLocal} />

      {/* Modal Novo Usuário */}
      {isModalOpen && (
        <form onSubmit={handleSaveUser} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] rounded-[2rem] w-full max-w-4xl overflow-hidden shadow-2xl animate-scaleIn border border-[var(--border-light)] flex flex-col max-h-[90vh]">
            <div className="bg-[#006B47] px-8 py-5 flex justify-between items-center text-white">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-widest">{editingUser ? 'Editar Perfil' : 'Novo Perfil de Acesso'}</h3>
                <p className="text-emerald-100 text-[9px] font-bold uppercase opacity-80">Segurança e Permissões</p>
              </div>
              <button type="button" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all text-xs">✕</button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-[var(--bg-secondary)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Username</label>
                  <input
                    type="text"
                    placeholder="ex: danilo_sep"
                    readOnly={!!editingUser}
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase() })}
                    className="w-full px-5 py-3.5 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Nome Completo</label>
                  <input
                    type="text"
                    placeholder="Nome do Colaborador"
                    value={newUser.nome}
                    onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })}
                    className="w-full px-5 py-3.5 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Senha de Acesso {editingUser && '(Deixe em branco para manter)'}</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newUser.senha}
                    onChange={(e) => setNewUser({ ...newUser, senha: e.target.value })}
                    className="w-full px-5 py-3.5 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Confirmar Senha</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newUser.confirmarSenha}
                    onChange={(e) => setNewUser({ ...newUser, confirmarSenha: e.target.value })}
                    className="w-full px-5 py-3.5 bg-[var(--bg-inner)] border border-[var(--border-light)] rounded-xl outline-none font-bold text-xs focus:ring-4 focus:ring-emerald-500/10 focus:bg-[var(--bg-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Nível de Hierarquia</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewUser({ ...newUser, role: 'user' })} className={`py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${newUser.role === 'user' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-muted)]'}`}>Operador</button>
                  <button type="button" onClick={() => setNewUser({ ...newUser, role: 'admin' })} className={`py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${newUser.role === 'admin' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-[var(--bg-secondary)] border-[var(--border-light)] text-[var(--text-muted)]'}`}>Administrador</button>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-light)]">
                <label className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1 mb-4 block">Módulos Autorizados</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'dashboard', label: 'Home', icon: '🏠' },
                    { key: 'enderecos', label: 'End.', icon: '📍' },
                    { key: 'empenhos', label: 'Emp.', icon: '📦' },
                    { key: 'blacklist', label: 'Black', icon: '❌' },
                    { key: 'separacao', label: 'Sep.', icon: '✅' },
                    { key: 'conferencia', label: 'Conf.', icon: '🔍' },
                    { key: 'transferencia', label: 'TEA', icon: '🏢' },
                    { key: 'historico', label: 'Hist.', icon: '📚' },
                  ].map((perm) => (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group ${(newUser.permissions as any)[perm.key]
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-[var(--bg-inner)] border-transparent hover:bg-[var(--bg-secondary)] hover:border-emerald-500/30'
                        }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-[#006B47] cursor-pointer"
                        checked={!!(newUser.permissions as any)[perm.key]}
                        onChange={() => togglePermission(perm.key)}
                      />
                      <span className={`text-[8px] font-black uppercase flex items-center gap-1 ${(newUser.permissions as any)[perm.key] ? 'text-emerald-700' : 'text-[var(--text-muted)] group-hover:text-emerald-500'
                        }`}>
                        {perm.icon} {perm.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[var(--bg-inner)] px-8 py-6 flex justify-end gap-3 border-t border-[var(--border-light)]">
              <button type="button" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="px-6 py-3 bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-muted)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-inner)] transition-all">Sair</button>
              <button type="submit" className="px-8 py-3 bg-[#006B47] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/10">
                {editingUser ? 'Atualizar Usuário' : 'Confirmar Cadastro'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Header Compacto */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight uppercase">Configurações</h1>
          <p className="text-[var(--text-muted)] font-bold text-[9px] uppercase tracking-[0.2em] mt-0.5">Gestão e Manutenção do Ecossistema</p>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-[var(--bg-secondary)] px-4 py-2 rounded-xl border border-[var(--border-light)] shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Base de Dados Supabase Conectada</span>
        </div>
      </div>

      {/* Grade de Utilitários em Mini-Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <button onClick={() => { setEditingUser(null); setNewUser(initialUserState); setIsModalOpen(true); }} className="col-span-1 md:col-span-1 bg-[#006B47] p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#004D33] transition-all shadow-lg shadow-emerald-500/10 group">
          <span className="text-xl group-hover:scale-110 transition-transform">👤</span>
          <span className="text-[8px] font-black text-emerald-50 uppercase tracking-widest">Novo Usuário</span>
        </button>

        <button onClick={handleExportLocal} className="bg-[var(--bg-secondary)] p-4 rounded-[1.5rem] border border-[var(--border-light)] flex flex-col items-center justify-center gap-2 hover:bg-[var(--bg-inner)] transition-all shadow-sm">
          <span className="text-xl">📤</span>
          <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Exportar</span>
        </button>

        <button onClick={() => fileInputRef.current?.click()} className="bg-[var(--bg-secondary)] p-4 rounded-[1.5rem] border border-[var(--border-light)] flex flex-col items-center justify-center gap-2 hover:bg-[var(--bg-inner)] transition-all shadow-sm">
          <span className="text-xl">📥</span>
          <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Importar</span>
        </button>

        <div className="hidden lg:block w-px h-full bg-[var(--border-light)] mx-auto"></div>

        <button onClick={handleSupabaseBackup} title="Salvar backup manual no Supabase" className="bg-[#F2A516]/10 border border-[#F2A516]/20 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#F2A516]/20 transition-all group">
          <span className="text-xl group-hover:rotate-12 transition-transform">🔄</span>
          <span className="text-[8px] font-black text-[#F2A516] uppercase tracking-widest">Backup</span>
        </button>

        <button onClick={handleRestoreBackup} title="Restaurar backup do Supabase" className="bg-[#F2A516]/10 border border-[#F2A516]/20 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#F2A516]/20 transition-all group">
          <span className="text-xl group-hover:scale-110 transition-transform">📥</span>
          <span className="text-[8px] font-black text-[#F2A516] uppercase tracking-widest">Restaura</span>
        </button>

        <button onClick={handleLogoutAll} className="bg-[#F2A516]/10 border border-[#F2A516]/20 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-[#F2A516]/20 transition-all group">
          <span className="text-xl group-hover:scale-90 transition-transform">🚪</span>
          <span className="text-[8px] font-black text-[#F2A516] uppercase tracking-widest">Deslogar</span>
        </button>

        <button onClick={handleResetSystem} className="bg-red-50 border border-red-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center gap-2 hover:bg-red-100 transition-all group">
          <span className="text-xl group-hover:animate-pulse transition-transform">🗑️</span>
          <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">Resetar</span>
        </button>
      </div>

      {/* Tabela de Usuários Otimizada */}
      <div className="bg-[var(--bg-secondary)] rounded-[2rem] border border-[var(--border-light)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[var(--bg-inner)]/50 border-b border-[var(--border-light)] text-[8px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
                <th className="px-8 py-5">Perfil</th>
                <th className="px-6 py-5">Nome</th>
                <th className="px-6 py-5 text-center">Nível</th>
                <th className="px-6 py-5 text-center">Permissão</th>
                <th className="px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {users.map((user) => {
                const isObjectPerms = typeof user.permissions === 'object' && !Array.isArray(user.permissions);
                const permCount = isObjectPerms ? Object.values(user.permissions).filter(Boolean).length : (Array.isArray(user.permissions) ? user.permissions.length : 0);

                return (
                  <tr key={user.username} className="hover:bg-[var(--bg-inner)]/30 transition-all group">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${user.role === 'admin' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--bg-inner)] text-[var(--text-muted)]'}`}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-black text-[var(--text-primary)] text-xs tracking-tight uppercase leading-none">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{user.nome}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-md text-[7px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-300'}`}>
                        {user.role === 'admin' ? 'Master' : 'Opera'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-[9px] font-bold border border-gray-100 uppercase">
                        {user.role === 'admin' ? 'Tudo' : `${permCount} Módulos`}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(user)} className="p-2 bg-[var(--bg-secondary)] border border-[var(--border-light)] text-emerald-600 rounded-lg hover:bg-emerald-500/10">✏️</button>
                        {user.username !== 'admin' && (
                          <button onClick={() => handleDelete(user.username)} className="p-2 bg-[var(--bg-secondary)] border border-[var(--border-light)] text-red-500 rounded-lg hover:bg-red-500/10">🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-[var(--bg-inner)]/50 px-8 py-4 flex justify-between items-center border-t border-[var(--border-light)]">
          <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Gereciamento de Segurança e Integração de Dados</p>
          <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total: {users.length} usuários</p>
        </div>
      </div>
    </div>
  );
};

export default Configuracoes;
