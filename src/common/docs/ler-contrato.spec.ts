import { describe, expect, it } from 'vitest';
import { lerContrato } from './ler-contrato';

const contrato = lerContrato();

describe('contrato HTTP', () => {
  it('cobre o cadastro com o corpo, a frase e os status reais', () => {
    const rota = contrato.get('POST /v1/auth/sign-up');
    expect(rota?.auth).toBe('publica');
    expect(rota?.exemploCorpo).toMatchObject({
      nome: 'Ana Lima',
      email: 'ana.lima@exemplo.com',
      senha: 'umaSenhaForte123',
      aceitouTermos: true,
    });
    expect(rota?.descricao).toContain('Digite seu nome.');
    expect(rota?.descricao).toContain('Aceite os termos para continuar.');
    expect(rota?.respostas.find((item) => item.status === 202)?.exemplo).toMatchObject({
      mensagem: 'Se o e-mail informado ainda não tiver conta, enviaremos um código de verificação para ele.',
    });
    expect(rota?.respostas.some((item) => item.status === 401)).toBe(false);
    expect(rota?.respostas.some((item) => item.status === 429 && JSON.stringify(item.exemplo).includes('Limite de taxa excedido.'))).toBe(true);
  });

  it('limita o erro da criação de viagem às falhas que o caso de uso devolve', () => {
    const rota = contrato.get('POST /v1/trips');
    const texto = rota?.respostas.map((item) => item.descricao).join(' ');
    expect(texto).toContain('Cidade não encontrada.');
    expect(texto).toContain('Escolha ao menos um destino.');
    expect(texto).toContain('Já existe alguém com esse nome nesta viagem.');
    expect(texto).not.toContain('Convite não encontrado.');
    expect(rota?.auth).toBe('viajante');
    expect(rota?.exemploCorpo).toMatchObject({ startMode: 'suggested', destinations: [{ customName: 'Alfama' }] });
  });

  it('documenta o webhook da Asaas e as métricas fora da v1', () => {
    const webhook = contrato.get('POST /webhooks/asaas');
    expect(webhook?.auth).toBe('webhook');
    expect(webhook?.exemploCorpo).toMatchObject({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_001' } });
    expect(webhook?.descricao).toContain('asaas-access-token');
    expect(webhook?.respostas.some((item) => item.status === 401)).toBe(true);

    const metricas = contrato.get('GET /metrics');
    expect(String(metricas?.respostas.find((item) => item.status === 200)?.exemplo)).toContain('http_request_duration_seconds');
    expect(String(metricas?.respostas.find((item) => item.status === 200)?.exemplo)).toContain('auth_revogacao_rejeicoes_total');
  });

  it('dá descrição, exemplo de sucesso e status a cada rota lida do código', () => {
    expect(contrato.size).toBeGreaterThan(200);
    for (const [chave, rota] of contrato) {
      expect(rota.descricao.length, chave).toBeGreaterThan(80);
      expect(rota.respostas.length, chave).toBeGreaterThan(1);
      expect(rota.respostas.some((item) => item.status < 300), chave).toBe(true);
      expect(rota.descricao, chave).not.toContain('lorem');
    }
  });
});
