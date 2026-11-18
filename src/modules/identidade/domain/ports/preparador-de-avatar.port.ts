export const PREPARADOR_DE_AVATAR = Symbol('PREPARADOR_DE_AVATAR');

export interface PreparadorDeAvatar {
  preparar(bytes: Buffer, mime: string): Promise<{ bytes: Buffer; mime: string }>;
}
