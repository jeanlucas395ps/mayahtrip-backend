export function podeExcluir(alvoId: string, autorId: string, ativos: number): 'unico' | null {
  if (alvoId === autorId && ativos <= 1) return 'unico';
  return null;
}

export function podeDesativar(alvoAtivo: boolean, ativos: number): 'unico' | null {
  if (alvoAtivo && ativos <= 1) return 'unico';
  return null;
}
