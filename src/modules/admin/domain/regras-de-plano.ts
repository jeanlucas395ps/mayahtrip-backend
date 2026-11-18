export interface PlanoParaRegra {
  isFree: boolean;
  isActive: boolean;
  temPrecoAtivo: boolean;
}

export type RecusaDePlano = 'free_imutavel' | 'sem_preco';

export function podeDesativar(plano: PlanoParaRegra): RecusaDePlano | null {
  if (plano.isFree) return 'free_imutavel';
  return null;
}

export function podeAtivar(plano: PlanoParaRegra): RecusaDePlano | null {
  if (plano.isFree) return null;
  if (!plano.temPrecoAtivo) return 'sem_preco';
  return null;
}
