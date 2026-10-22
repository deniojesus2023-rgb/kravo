/**
 * Dados do cliente para a API de Conversões, no formato que o Meta exige: normalizados e em SHA-256 (hex).
 * Só o hash sai daqui; o dado em claro não é guardado nem registrado. CPF nunca é enviado.
 */

import { createHash } from 'node:crypto';

export interface CustomerInput {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}

export interface HashedUserData {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  ct?: string;
  st?: string;
  zp?: string;
  country?: string;
  external_id?: string;
}

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const clean = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '');

/** Só letras (inclusive acentuadas) e espaço, em minúsculas. */
const lettersOnly = (v: string) => v.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

export function normalizeEmail(v: string | null | undefined): string | null {
  const e = clean(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Só dígitos, com código do país. Número brasileiro sem código (10 ou 11 dígitos) ganha 55. */
export function normalizePhone(v: string | null | undefined): string | null {
  let d = clean(v).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function normalizeNames(name: string | null | undefined): { fn?: string; ln?: string } {
  const parts = lettersOnly(clean(name)).split(' ').filter(Boolean);
  if (parts.length === 0) return {};
  return parts.length === 1 ? { fn: parts[0] } : { fn: parts[0], ln: parts[parts.length - 1] };
}

export function buildUserData(c: CustomerInput): HashedUserData {
  const out: HashedUserData = {};
  const em = normalizeEmail(c.email);
  if (em) out.em = sha256(em);
  const ph = normalizePhone(c.phone);
  if (ph) out.ph = sha256(ph);
  const { fn, ln } = normalizeNames(c.name);
  if (fn) out.fn = sha256(fn);
  if (ln) out.ln = sha256(ln);
  const ct = lettersOnly(clean(c.city)).replace(/\s/g, '');
  if (ct) out.ct = sha256(ct);
  const st = lettersOnly(clean(c.state)).replace(/\s/g, '');
  if (/^[a-z]{2}$/.test(st)) out.st = sha256(st);
  const zp = clean(c.zip).replace(/\D/g, '');
  if (zp.length === 8) out.zp = sha256(zp);
  const country = clean(c.country).toLowerCase();
  if (/^[a-z]{2}$/.test(country)) out.country = sha256(country);
  const id = clean(c.id);
  if (id) out.external_id = sha256(id);
  return out;
}

/** Quais identificadores foram enviados: base do indicador de qualidade. Nunca devolve o hash. */
export const matchKeys = (u: HashedUserData): string[] => Object.keys(u).filter((k) => (u as Record<string, unknown>)[k]);
