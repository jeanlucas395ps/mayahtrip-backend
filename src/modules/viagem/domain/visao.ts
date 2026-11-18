import { Papel, VisaoDaViagem } from './ports/viagem.port';

/** BUSINESS.md §4.3. Remover, trocar papel e passar a posse ficam no item seguinte. */
export function visaoDe(papel: Papel): VisaoDaViagem {
  if (papel === 'owner' || papel === 'supreme_traveler') {
    return { itinerary: true, edit: true, expenses: true, documents: true };
  }
  if (papel === 'experienced_traveler') {
    return { itinerary: true, edit: true, expenses: true, documents: false };
  }
  return { itinerary: true, edit: false, expenses: false, documents: false };
}

/** Comentário de trip_participants: dono, supremo e experiente convidam. O júnior não. */
export function podeConvidar(papel: Papel): boolean {
  return papel === 'owner' || papel === 'supreme_traveler' || papel === 'experienced_traveler';
}
