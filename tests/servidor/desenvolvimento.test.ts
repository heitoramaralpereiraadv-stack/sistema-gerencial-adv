import { afterEach, describe, expect, it, vi } from "vitest";
import { usuarioDeDesenvolvimento } from "@/servidor/auth/desenvolvimento";

afterEach(() => vi.unstubAllEnvs());

describe("acesso de desenvolvimento", () => {
  it("vale só com next dev, fora da Vercel e com DEV_USUARIO_ID", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_USUARIO_ID", "id-ficticio");
    vi.stubEnv("VERCEL", "");
    expect(usuarioDeDesenvolvimento()).toBe("id-ficticio");
  });
  it("é ignorado em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_USUARIO_ID", "id-ficticio");
    expect(usuarioDeDesenvolvimento()).toBeNull();
  });
  it("é ignorado na Vercel, mesmo em desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_USUARIO_ID", "id-ficticio");
    vi.stubEnv("VERCEL", "1");
    expect(usuarioDeDesenvolvimento()).toBeNull();
  });
});
