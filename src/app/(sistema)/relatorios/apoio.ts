import { itensDaLista, statusAtivos, usuariosAtivos } from "@/servidor/servicos/referencias";
import type { Filtros } from "@/servidor/relatorios/tipos";

/** Opções dos filtros de relatório (seção 6: período, responsável, área, status). */
export async function opcoesDeFiltro() {
  const [usuarios, areas, status] = await Promise.all([usuariosAtivos(), itensDaLista("AREA"), statusAtivos()]);
  return {
    responsaveis: usuarios.map((u) => ({ id: u.id, nome: u.nome })),
    areas: areas.map((a) => ({ id: a.id, nome: a.valor })),
    status: status.map((s) => ({ id: s.id, nome: s.nome })),
  };
}

export const parametrosDeFiltro = (f: Filtros, periodo: boolean): Record<string, string | undefined> => ({
  ...(periodo && { inicio: f.inicio, fim: f.fim }),
  responsavelId: f.responsavelId,
  areaId: f.areaId,
  statusId: f.statusId,
});
