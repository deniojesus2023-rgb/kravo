import { describe, expect, it } from 'vitest';
import { authErrorMessage, GENERIC_AUTH_ERROR, validateEmail, validatePassword } from '@/lib/auth/messages';
import { safeNext } from '@/lib/auth/redirect';

describe('safeNext (redirecionamento pós-login)', () => {
  it('aceita caminhos internos, com query', () => {
    expect(safeNext('/ofertas/ansiedade-zero')).toBe('/ofertas/ansiedade-zero');
    expect(safeNext('/?periodo=7d')).toBe('/?periodo=7d');
  });

  it('rejeita destinos externos e truques de URL', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'evil.com', 'javascript:alert(1)', '/ok\nhttp://x', '']) {
      expect(safeNext(bad), bad).toBe('/');
    }
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(null, '/inicio')).toBe('/inicio');
  });

  it('usa o primeiro valor quando vem lista', () => {
    expect(safeNext(['/a', '/b'])).toBe('/a');
  });
});

describe('mensagens de erro', () => {
  it('traduz códigos conhecidos', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.');
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toMatch(/Confirme seu e-mail/);
  });

  it('cai em mensagem genérica, sem repassar texto do servidor', () => {
    expect(authErrorMessage({ code: 'algo_novo' })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
  });
});

describe('validação', () => {
  it('e-mail', () => {
    expect(validateEmail('ana@exemplo.com.br')).toBeNull();
    for (const bad of ['', 'ana', 'ana@', 'ana@exemplo', 'a b@exemplo.com']) expect(validateEmail(bad), bad).not.toBeNull();
  });

  it('senha: 8 a 72 caracteres', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('x'.repeat(73))).not.toBeNull();
  });
});
