const SENSITIVE_KEYS = new Set([
  'senha',
  'password',
  'hashSenha',
  'codigo',
  'code',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'README_API_KEY',
  'readme_api_key',
  'apiKey',
]);

/**
 * DEVELOPMENT.md §9/§11: log nunca contém senha, código ou token em texto
 * puro. Usada antes de qualquer `logger.log(objeto)` que venha de entrada
 * do usuário ou de uma entidade de domínio.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(key) ? '[redacted]' : redact(val),
      ]),
    );
  }

  return value;
}
