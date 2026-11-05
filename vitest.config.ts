import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    // "server-only" só existe no runtime do Next; nos testes é um módulo vazio.
    "server-only": fileURLToPath(new URL("./tests/apoio/vazio.ts", import.meta.url)),
  },
};

export default defineConfig({
  resolve,
  test: {
    // Os testes de integração compartilham um banco; rodam um arquivo por vez.
    fileParallelism: false,
    projects: [
      { resolve, test: { name: "unidade", include: ["tests/dominio/**/*.test.ts", "tests/servidor/**/*.test.ts", "tests/importacao/**/*.test.ts"] } },
      {
        resolve,
        test: {
          name: "integracao",
          include: ["tests/integracao/**/*.test.ts"],
          globalSetup: ["tests/integracao/preparar-banco.ts"],
          env: {
            DATABASE_URL: process.env.DATABASE_URL_TESTE ?? "",
            // Chaves fictícias, só para testes.
            CHAVE_CIFRAGEM: Buffer.alloc(32, 7).toString("base64"),
            CHAVE_INDICE: Buffer.alloc(32, 9).toString("base64"),
          },
        },
      },
    ],
  },
});
