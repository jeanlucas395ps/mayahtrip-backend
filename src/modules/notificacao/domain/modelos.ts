export const EVENTOS = [
  'welcome',
  'itinerary.ready',
  'trip.invite',
  'trip.invite.declined',
  'expense.shared',
  'comment.created',
  'comment.reply',
  'post.liked',
  'post.mention',
  'report.accepted',
  'report.dismissed',
] as const;

export type EventoDeAviso = (typeof EVENTOS)[number];

type Texto = { title: string; body: string };

const TEXTOS: Record<EventoDeAviso, Record<'pt-BR' | 'pt-PT' | 'en' | 'es', Texto>> = {
  welcome: {
    'pt-BR': { title: 'Bem-vindo ao MayahTrip!', body: 'Crie sua primeira viagem em 4 toques ou explore o que a comunidade anda postando.' },
    'pt-PT': { title: 'Bem-vindo ao MayahTrip!', body: 'Crie a sua primeira viagem em 4 toques ou explore o que a comunidade anda a publicar.' },
    en: { title: 'Welcome to MayahTrip!', body: 'Create your first trip in 4 taps or see what the community is posting.' },
    es: { title: '¡Bienvenido a MayahTrip!', body: 'Crea tu primer viaje en 4 toques o mira lo que publica la comunidad.' },
  },
  'itinerary.ready': {
    'pt-BR': { title: 'Roteiro de {viagem} pronto', body: '{dias} dias organizados para você.' },
    'pt-PT': { title: 'Roteiro de {viagem} pronto', body: '{dias} dias organizados para si.' },
    en: { title: 'Itinerary for {viagem} is ready', body: '{dias} days organized for you.' },
    es: { title: 'El itinerario de {viagem} está listo', body: '{dias} días organizados para ti.' },
  },
  'trip.invite': {
    'pt-BR': { title: 'Convite de viagem', body: '{nome} te convidou para a viagem {viagem}.' },
    'pt-PT': { title: 'Convite de viagem', body: '{nome} convidou-o para a viagem {viagem}.' },
    en: { title: 'Trip invite', body: '{nome} invited you to {viagem}.' },
    es: { title: 'Invitación de viaje', body: '{nome} te invitó al viaje {viagem}.' },
  },
  'trip.invite.declined': {
    'pt-BR': { title: 'Convite recusado', body: '{nome} recusou o convite para {viagem}.' },
    'pt-PT': { title: 'Convite recusado', body: '{nome} recusou o convite para {viagem}.' },
    en: { title: 'Invite declined', body: '{nome} declined the invite to {viagem}.' },
    es: { title: 'Invitación rechazada', body: '{nome} rechazó la invitación a {viagem}.' },
  },
  'expense.shared': {
    'pt-BR': { title: 'Gasto na viagem', body: '{nome} adicionou {descricao} em {viagem}.' },
    'pt-PT': { title: 'Despesa na viagem', body: '{nome} adicionou {descricao} em {viagem}.' },
    en: { title: 'Trip expense', body: '{nome} added {descricao} in {viagem}.' },
    es: { title: 'Gasto del viaje', body: '{nome} agregó {descricao} en {viagem}.' },
  },
  'comment.created': {
    'pt-BR': { title: 'Novo comentário', body: '{nome} comentou na sua publicação.' },
    'pt-PT': { title: 'Novo comentário', body: '{nome} comentou na sua publicação.' },
    en: { title: 'New comment', body: '{nome} commented on your post.' },
    es: { title: 'Nuevo comentario', body: '{nome} comentó en tu publicación.' },
  },
  'comment.reply': {
    'pt-BR': { title: 'Nova resposta', body: '{nome} respondeu o seu comentário.' },
    'pt-PT': { title: 'Nova resposta', body: '{nome} respondeu ao seu comentário.' },
    en: { title: 'New reply', body: '{nome} replied to your comment.' },
    es: { title: 'Nueva respuesta', body: '{nome} respondió a tu comentario.' },
  },
  'post.liked': {
    'pt-BR': { title: 'Nova curtida', body: '{nome} curtiu a sua publicação.' },
    'pt-PT': { title: 'Novo gosto', body: '{nome} gostou da sua publicação.' },
    en: { title: 'New like', body: '{nome} liked your post.' },
    es: { title: 'Nuevo me gusta', body: '{nome} indicó que le gusta tu publicación.' },
  },
  'post.mention': {
    'pt-BR': { title: 'Menção', body: '{nome} mencionou você numa publicação.' },
    'pt-PT': { title: 'Menção', body: '{nome} mencionou-o numa publicação.' },
    en: { title: 'Mention', body: '{nome} mentioned you in a post.' },
    es: { title: 'Mención', body: '{nome} te mencionó en una publicación.' },
  },
  'report.accepted': {
    'pt-BR': { title: 'Denúncia', body: 'Sua denúncia foi aceita.' },
    'pt-PT': { title: 'Denúncia', body: 'A sua denúncia foi aceite.' },
    en: { title: 'Report', body: 'Your report was accepted.' },
    es: { title: 'Denuncia', body: 'Tu denuncia fue aceptada.' },
  },
  'report.dismissed': {
    'pt-BR': { title: 'Denúncia', body: 'Sua denúncia não foi aceita.' },
    'pt-PT': { title: 'Denúncia', body: 'A sua denúncia não foi aceite.' },
    en: { title: 'Report', body: 'Your report was not accepted.' },
    es: { title: 'Denuncia', body: 'Tu denuncia no fue aceptada.' },
  },
};

export function linhasDeModelo(): { eventType: string; locale: string; channel: string; title: string; body: string }[] {
  const locais = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
  const canais = ['in_app', 'push'] as const;
  return EVENTOS.flatMap((evento) =>
    locais.flatMap((locale) =>
      canais.map((channel) => ({
        eventType: evento,
        locale,
        channel,
        title: TEXTOS[evento][locale].title,
        body: TEXTOS[evento][locale].body,
      })),
    ),
  );
}
