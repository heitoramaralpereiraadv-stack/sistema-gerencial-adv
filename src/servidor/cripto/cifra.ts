// Cifragem dos dados críticos no nível da aplicação (seção 7 e D5): números de documentos,
// dados fiscais e de caráter personalíssimo. AES-256-GCM com IV aleatório; HMAC-SHA256 para
// unicidade e busca exata sem guardar o valor em claro.
//
// Chaves (32 bytes em base64) só em variáveis de ambiente do servidor:
//   CHAVE_CIFRAGEM  — cifra e decifra
//   CHAVE_INDICE    — índice de busca (HMAC)
// Perder CHAVE_CIFRAGEM torna os dados ilegíveis: guardar cópia com os sócios, fora do sistema.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSAO = "v1";

function chave(nome: "CHAVE_CIFRAGEM" | "CHAVE_INDICE"): Buffer {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} não configurada.`);
  const bytes = Buffer.from(valor, "base64");
  if (bytes.length < 32) throw new Error(`${nome} deve ter 32 bytes em base64.`);
  return bytes.subarray(0, 32);
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave("CHAVE_CIFRAGEM"), iv);
  const conteudo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${VERSAO}.${Buffer.concat([iv, c.getAuthTag(), conteudo]).toString("base64url")}`;
}

export function decifrar(cifrado: string): string {
  const [versao, corpo] = cifrado.split(".");
  if (versao !== VERSAO || !corpo) throw new Error("Formato de dado cifrado desconhecido.");
  const bytes = Buffer.from(corpo, "base64url");
  const d = createDecipheriv("aes-256-gcm", chave("CHAVE_CIFRAGEM"), bytes.subarray(0, 12));
  d.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([d.update(bytes.subarray(28)), d.final()]).toString("utf8");
}

export function cifrarOpcional(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? cifrar(t) : null;
}

export function decifrarOpcional(cifrado: string | null | undefined): string | null {
  return cifrado ? decifrar(cifrado) : null;
}

/** Índice determinístico para busca exata e unicidade (ex.: CPF normalizado). */
export function indiceBusca(valorNormalizado: string): string {
  return createHmac("sha256", chave("CHAVE_INDICE")).update(valorNormalizado).digest("hex");
}

/** "•••.•••.•89-09": mostra só os últimos caracteres do documento, mantendo a pontuação. */
export function mascarar(valor: string, visiveis = 4): string {
  let restantes = (valor.match(/[0-9A-Za-z]/g) ?? []).length;
  return valor.replace(/[0-9A-Za-z]/g, (c) => (restantes-- > visiveis ? "•" : c));
}
