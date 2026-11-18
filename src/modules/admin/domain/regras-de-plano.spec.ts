import { describe, expect, it } from 'vitest';
import { podeAtivar, podeDesativar } from './regras-de-plano';

describe('regras de plano', () => {
  it('deve recusar desativar o Free quando o plano é gratuito', () => {
    expect(podeDesativar({ isFree: true, isActive: true, temPrecoAtivo: false })).toBe('free_imutavel');
  });

  it('deve permitir desativar um plano pago quando ele está ativo', () => {
    expect(podeDesativar({ isFree: false, isActive: true, temPrecoAtivo: true })).toBeNull();
  });

  it('deve recusar ativar um plano sem preço quando ele não é Free', () => {
    expect(podeAtivar({ isFree: false, isActive: false, temPrecoAtivo: false })).toBe('sem_preco');
  });

  it('deve permitir ativar o Free quando ele não tem preço', () => {
    expect(podeAtivar({ isFree: true, isActive: true, temPrecoAtivo: false })).toBeNull();
  });

  it('deve permitir ativar um plano pago quando existe preço ativo', () => {
    expect(podeAtivar({ isFree: false, isActive: false, temPrecoAtivo: true })).toBeNull();
  });
});
