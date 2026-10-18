/**
 * Destino pós-login vindo da URL. Só aceita caminho interno ("/ofertas/x"):
 * rejeita "//host", "/\host", URLs absolutas e qualquer coisa que não comece com "/".
 */
export function safeNext(value: string | string[] | null | undefined, fallback = '/'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
