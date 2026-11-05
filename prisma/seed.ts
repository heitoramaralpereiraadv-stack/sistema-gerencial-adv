// Carga inicial: npx prisma db seed (ou npm run seed).
import "dotenv/config";
import { criarPrisma } from "../src/servidor/db/prisma";
import { cargaInicial } from "../src/servidor/seed/carga-inicial";

const prisma = criarPrisma();
const ano = new Date().getFullYear();
await cargaInicial(prisma, [ano - 1, ano, ano + 1]);
await prisma.$disconnect();
console.log(`Carga inicial concluída (feriados de ${ano - 1} a ${ano + 1}).`);
