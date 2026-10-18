/** Mensagens em português para erros do Supabase Auth. Nunca repassamos o texto bruto do servidor. */
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail. Entre ou peça um link de acesso.',
  email_exists: 'Já existe uma conta com este e-mail. Entre ou peça um link de acesso.',
  weak_password: 'Senha fraca. Use ao menos 8 caracteres, misturando letras e números.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  email_address_invalid: 'Este e-mail não parece válido.',
  signup_disabled: 'Novos cadastros estão desativados no momento.',
  otp_expired: 'O link expirou. Peça um novo.',
};

export const GENERIC_AUTH_ERROR = 'Não foi possível concluir agora. Tente de novo em instantes.';

export function authErrorMessage(error: { code?: string; status?: number } | null | undefined): string {
  if (error?.code && BY_CODE[error.code]) return BY_CODE[error.code]!;
  if (error?.status === 429) return BY_CODE.over_request_rate_limit!;
  return GENERIC_AUTH_ERROR;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  return EMAIL.test(email) && email.length <= 254 ? null : 'Informe um e-mail válido.';
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  return null;
}
