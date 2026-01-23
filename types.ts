
export type UrgencyLevel = 'baixa' | 'media' | 'alta' | 'urgencia';

export interface Product {
  id: string | number;
  codigo: string;
  descricao: string;
  unidade?: string;
  armazem?: string;
  endereco?: string;
}

export interface OPItem extends Product {
  op: string;
  quantidade: number;
  qtdSeparada: number;
  separado: boolean;
  transferido: boolean;
  naoSeparado: boolean;
  observacao?: string;
  falta?: boolean;
  ok?: boolean;
}

export interface SeparationList {
  id: string;
  nome: string;
  armazem: string;
  ordens: string[];
  itens: OPItem[];
  status: 'pendente' | 'em_conferencia' | 'finalizado';
  urgencia: UrgencyLevel;
  dataCriacao: string;
  documento: string;
  responsavel: string;
  usuarioAtual?: string | null;
}

export interface MatrixBranchRecord {
  id: string;
  op: string;
  produto: string;
  descricao: string;
  quantidade: number;
  status: 'separacao' | 'conferencia' | 'qualidade' | 'enderecar' | 'transito' | 'recebido';
  dataCriacao: string;
  historicoStatus: {
    status: string;
    data: string;
    usuario: string;
  }[];
}

export interface User {
  id: string | number;
  username: string;
  nome: string;
  role: 'admin' | 'user' | 'visitor';
  permissions: string[];
  foto?: string;
}
