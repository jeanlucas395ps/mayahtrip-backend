import { Lugar } from '../preferencia';

export const LOCALIZADOR = Symbol('LOCALIZADOR');

/** ARCHITECTURE.md: ipapi.co informa idioma, moeda e fuso. O app não chama o provedor. */
export interface Localizador {
  porIp(ip: string): Promise<Lugar | null>;
}
