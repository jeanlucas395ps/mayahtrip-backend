import { describe, expect, it } from 'vitest';
import { DocumentoInvalidoError, LIMITE_DOCUMENTO_BYTES, prepararDocumento } from './documento';

const pdf = { nomeArquivo: 'rg.pdf', mime: 'application/pdf', bytes: 12 };

describe('documento pessoal', () => {
  it('aceita os quatro tipos e só liga a carteira quando há código', () => {
    expect(prepararDocumento({ ...pdf, tipo: 'cpf', codigo: '', carteira: '' }).carteira).toBeNull();
    expect(prepararDocumento({ ...pdf, tipo: 'onibus', codigo: 'ABC', carteira: '' })).toMatchObject({
      tipo: 'bus_ticket',
      codigo: 'ABC',
      carteira: null,
    });
    expect(prepararDocumento({ ...pdf, tipo: 'aviao', codigo: 'M1', carteira: 'google' })).toMatchObject({
      tipo: 'flight_ticket',
      carteira: 'google_wallet',
    });
    expect(prepararDocumento({ ...pdf, mime: 'image/jpg', tipo: 'cnh', codigo: 'XYZ', carteira: '' }).mime).toBe('image/jpeg');
  });

  it('recusa carteira sem código, tipo fora da lista, arquivo que não é imagem nem PDF e arquivo acima de 10 MB', () => {
    expect(() => prepararDocumento({ ...pdf, tipo: 'aviao', codigo: '  ', carteira: 'apple' })).toThrow(DocumentoInvalidoError);
    expect(() => prepararDocumento({ ...pdf, tipo: 'passaporte', codigo: '', carteira: '' })).toThrow(DocumentoInvalidoError);
    expect(() => prepararDocumento({ ...pdf, mime: 'text/plain', tipo: 'cpf', codigo: '', carteira: '' })).toThrow(DocumentoInvalidoError);
    expect(() => prepararDocumento({ ...pdf, bytes: LIMITE_DOCUMENTO_BYTES + 1, tipo: 'cpf', codigo: '', carteira: '' })).toThrow(
      DocumentoInvalidoError,
    );
  });
});
