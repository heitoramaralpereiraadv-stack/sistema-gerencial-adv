import Link from "next/link";
import { RELATORIOS } from "@/servidor/relatorios/consultas";

export default function Relatorios() {
  return (
    <>
      <h1>Relatórios</h1>
      <p className="suave">Todos aceitam filtros e exportam em Excel e PDF com o cabeçalho do escritório.</p>
      <ul className="lista-itens">
        {Object.entries(RELATORIOS).map(([tipo, r]) => (
          <li key={tipo} className="item">
            <Link href={`/relatorios/${tipo}`}><strong>{r.titulo}</strong></Link>
            <p className="item-linha suave">{r.descricao}</p>
          </li>
        ))}
        <li className="item">
          <Link href="/processos"><strong>Lista de processos</strong></Link>
          <p className="item-linha suave">Exportação da lista filtrada na tela de Processos.</p>
        </li>
        <li className="item">
          <Link href="/clientes"><strong>Ficha do cliente</strong></Link>
          <p className="item-linha suave">Dados do cliente, processos e último andamento de cada um, para envio ao cliente (na ficha de cada cliente).</p>
        </li>
      </ul>
    </>
  );
}
