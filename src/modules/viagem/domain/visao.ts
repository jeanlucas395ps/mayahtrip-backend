import { Papel, VisaoDaViagem } from './ports/viagem.port';

/** BUSINESS.md §4.3. Convidar e remover continuam no item de posse. */
export function visaoDe(papel: Papel): VisaoDaViagem {
  if (papel === 'owner' || papel === 'supreme_traveler') {
    return { itinerary: true, edit: true, expenses: true, documents: true };
  }
  if (papel === 'experienced_traveler') {
    return { itinerary: true, edit: true, expenses: true, documents: false };
  }
  return { itinerary: true, edit: false, expenses: false, documents: false };
}
