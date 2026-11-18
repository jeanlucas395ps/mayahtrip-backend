import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface Agente {
  id: string;
  provider: string;
  modelName: string;
  isActive: boolean;
  name: string;
  family: string;
  conversationType: string;
  maxTokens: number;
  temperature: number;
  prompts: string;
  sortOrder: number;
}

export interface AgenteNovo {
  provider: string;
  modelName: string;
  name: string;
  family: 'GPT-4' | 'GPT-5';
  conversationType: string;
  maxTokens: number;
  temperature: number;
  prompts: string;
  sortOrder: number;
}

const RESPOSTA: Record<string, string> = {
  'pt-BR': 'Posso tirar a dúvida. Eu não crio viagem, não lanço gasto e não mudo o roteiro.',
  'pt-PT': 'Posso tirar a dúvida. Eu não crio viagem, não lanço despesa e não mudo o roteiro.',
  en: 'I can answer the question. I do not create a trip, add an expense, or change the itinerary.',
  es: 'Puedo resolver la duda. No creo el viaje, no cargo un gasto y no cambio el itinerario.',
};

@Injectable()
export class MayaUseCase {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async conversar(userId: string, conversationId: string | null, content: string): Promise<{ conversationId: string; messageId: string; answer: string; plan: 'free' | 'pro' } | 'ausente' | 'sem-agente'> {
    const agente = await this.agenteAtivo();
    if (!agente) return 'sem-agente';
    const locale = await this.localeDe(userId);
    const plano = await this.planoDe(userId);
    let conversa = conversationId;
    if (!conversa) {
      const criadas = await this.dados.query<{ id: string }[]>(
        `INSERT INTO maya.maya_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [userId, content.slice(0, 80)],
      );
      conversa = criadas[0].id;
    } else {
      const donas = await this.dados.query(`SELECT 1 FROM maya.maya_conversations WHERE id = $1 AND user_id = $2`, [conversa, userId]);
      if (donas.length === 0) return 'ausente';
    }
    await this.dados.query(
      `INSERT INTO maya.maya_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversa, content],
    );
    const resposta = RESPOSTA[locale] ?? RESPOSTA['pt-BR'];
    const assistente = await this.dados.query<{ id: string }[]>(
      `INSERT INTO maya.maya_messages (conversation_id, role, content, model) VALUES ($1, 'assistant', $2, $3) RETURNING id`,
      [conversa, resposta, agente.modelName],
    );
    await this.dados.query(
      `INSERT INTO maya.maya_usage (user_id, conversation_id, model, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, conversa, agente.modelName, content.length, resposta.length],
    );
    return { conversationId: conversa, messageId: assistente[0].id, answer: resposta, plan: plano };
  }

  async ler(userId: string, conversationId: string): Promise<{ id: string; plan: 'free' | 'pro'; messages: { id: string; role: string; content: string }[] } | 'ausente'> {
    const donas = await this.dados.query(`SELECT 1 FROM maya.maya_conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
    if (donas.length === 0) return 'ausente';
    const mensagens = await this.dados.query<{ id: string; role: string; content: string }[]>(
      `SELECT id, role, content FROM maya.maya_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [conversationId],
    );
    return { id: conversationId, plan: await this.planoDe(userId), messages: mensagens };
  }

  async opinar(userId: string, messageId: string, rating: number | null, feedbackText: string | null): Promise<{ id: string } | 'ausente'> {
    const mensagens = await this.dados.query<{ conversation_id: string }[]>(
      `SELECT mensagem.conversation_id
       FROM maya.maya_messages mensagem
       JOIN maya.maya_conversations conversa ON conversa.id = mensagem.conversation_id
       WHERE mensagem.id = $1 AND conversa.user_id = $2`,
      [messageId, userId],
    );
    if (mensagens.length === 0) return 'ausente';
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO maya.maya_feedback (user_id, conversation_id, message_id, rating, feedback_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, mensagens[0].conversation_id, messageId, rating, feedbackText],
    );
    return { id: criados[0].id };
  }

  async listarAgentes(): Promise<Agente[]> {
    const linhas = await this.dados.query<{ id: string; provider: string; model_name: string; is_active: boolean; configuration: Record<string, unknown> }[]>(
      `SELECT id, provider, model_name, is_active, configuration FROM maya.maya_model_configs ORDER BY created_at`,
    );
    return linhas.map(agenteDe);
  }

  async criarAgente(entrada: AgenteNovo): Promise<Agente> {
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO maya.maya_model_configs (provider, model_name, configuration, is_active)
       VALUES ($1, $2, $3::jsonb, false) RETURNING id`,
      [entrada.provider, entrada.modelName, JSON.stringify(configDe(entrada))],
    );
    return (await this.porId(criados[0].id))!;
  }

  async editarAgente(id: string, entrada: AgenteNovo): Promise<Agente | 'ausente'> {
    const linhas = await this.dados.query(
      `UPDATE maya.maya_model_configs
       SET provider = $2, model_name = $3, configuration = $4::jsonb, updated_at = clock_timestamp()
       WHERE id = $1 RETURNING id`,
      [id, entrada.provider, entrada.modelName, JSON.stringify(configDe(entrada))],
    );
    if (linhasRetornadas(linhas).length === 0) return 'ausente';
    return (await this.porId(id))!;
  }

  async definirAtivo(id: string, ativo: boolean): Promise<Agente | 'ausente'> {
    const linhas = await this.dados.query(
      `UPDATE maya.maya_model_configs SET is_active = $2, updated_at = clock_timestamp() WHERE id = $1 RETURNING id`,
      [id, ativo],
    );
    if (linhasRetornadas(linhas).length === 0) return 'ausente';
    return (await this.porId(id))!;
  }

  async excluirAgente(id: string): Promise<'ok' | 'ausente'> {
    const linhas = await this.dados.query(`DELETE FROM maya.maya_model_configs WHERE id = $1 RETURNING id`, [id]);
    return linhasRetornadas(linhas).length > 0 ? 'ok' : 'ausente';
  }

  async criarPadrao(): Promise<Agente[]> {
    const prontos: AgenteNovo[] = [
      { provider: 'openai', modelName: 'gpt-4o', name: 'Maya', family: 'GPT-4', conversationType: 'duvida', maxTokens: 800, temperature: 0.4, prompts: 'Responda no idioma de quem pergunta. Não grave viagem, gasto nem roteiro.', sortOrder: 1 },
      { provider: 'openai', modelName: 'gpt-5', name: 'Maya longa', family: 'GPT-5', conversationType: 'duvida', maxTokens: 1200, temperature: 0.3, prompts: 'Responda no idioma de quem pergunta. Não grave viagem, gasto nem roteiro.', sortOrder: 2 },
    ];
    for (const pronto of prontos) await this.criarAgente(pronto);
    return this.listarAgentes();
  }

  async sandbox(id: string, _question: string): Promise<{ answer: string } | 'ausente'> {
    const agente = await this.porId(id);
    if (!agente) return 'ausente';
    return { answer: `${agente.name}: ${RESPOSTA['pt-BR']}` };
  }

  private async agenteAtivo(): Promise<{ modelName: string } | null> {
    const linhas = await this.dados.query<{ model_name: string }[]>(
      `SELECT model_name FROM maya.maya_model_configs WHERE is_active ORDER BY (configuration->>'sortOrder')::int NULLS LAST, created_at LIMIT 1`,
    );
    return linhas[0] ? { modelName: linhas[0].model_name } : null;
  }

  private async localeDe(userId: string): Promise<string> {
    const linhas = await this.dados.query<{ locale: string }[]>(`SELECT locale FROM identity.user_preferences WHERE user_id = $1`, [userId]);
    return linhas[0]?.locale ?? 'pt-BR';
  }

  private async planoDe(userId: string): Promise<'free' | 'pro'> {
    const linhas = await this.dados.query(
      `SELECT 1
       WHERE EXISTS (
         SELECT 1 FROM subscription.user_subscriptions
         WHERE user_id = $1 AND status = 'active' AND (current_period_end IS NULL OR current_period_end > clock_timestamp())
       )
       OR EXISTS (
         SELECT 1 FROM subscription.promo_grants
         WHERE user_id = $1 AND revoked_at IS NULL AND ends_at > clock_timestamp()
       )`,
      [userId],
    );
    return linhas.length > 0 ? 'pro' : 'free';
  }

  private async porId(id: string): Promise<Agente | null> {
    const linhas = await this.dados.query<{ id: string; provider: string; model_name: string; is_active: boolean; configuration: Record<string, unknown> }[]>(
      `SELECT id, provider, model_name, is_active, configuration FROM maya.maya_model_configs WHERE id = $1`,
      [id],
    );
    return linhas[0] ? agenteDe(linhas[0]) : null;
  }
}

function configDe(entrada: AgenteNovo): Record<string, unknown> {
  return {
    name: entrada.name,
    family: entrada.family,
    conversationType: entrada.conversationType,
    maxTokens: entrada.maxTokens,
    temperature: entrada.temperature,
    prompts: entrada.prompts,
    sortOrder: entrada.sortOrder,
  };
}

function agenteDe(linha: { id: string; provider: string; model_name: string; is_active: boolean; configuration: Record<string, unknown> | null }): Agente {
  const config = linha.configuration ?? {};
  return {
    id: linha.id,
    provider: linha.provider,
    modelName: linha.model_name,
    isActive: linha.is_active,
    name: String(config.name ?? linha.model_name),
    family: String(config.family ?? ''),
    conversationType: String(config.conversationType ?? ''),
    maxTokens: Number(config.maxTokens ?? 0),
    temperature: Number(config.temperature ?? 0),
    prompts: String(config.prompts ?? ''),
    sortOrder: Number(config.sortOrder ?? 0),
  };
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}
