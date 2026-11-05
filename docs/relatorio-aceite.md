# Relatório dos critérios de aceite — fase 1 (seção 8.2)

Rodado em 05/11/2026, antes da implantação no Supabase. Verificações com dados reais da
planilha feitas só em bancos locais descartáveis, apagados em seguida; testes automatizados
com dados fictícios.

**Resumo:** 10 critérios — nenhum falhou. 5 passaram integralmente; 1 passou com diferenças
explicadas e uma definição a confirmar; 4 passaram localmente e dependem de uma etapa externa
para serem fechados (Supabase, conferência por advogado ou uso pelos usuários).

| # | Critério | Resultado | Como foi verificado | O que falta |
| --- | --- | --- | --- | --- |
| 1 | Os 81 processos e todos os clientes importados, com o relatório de importação conferido | **Passou localmente** | Planilha real importada em banco local: 81 processos + 2 relacionados (C4), 51 clientes, 53 demais partes, 18 comarcas, 5 grupos mesclados (6 cadastros unidos), 5 nomes separados, 35 registros com pendência no relatório | Importação no Supabase pela tela de revisão e conferência do relatório pelos sócios |
| 2 | Número CNJ inválido é recusado; válido preenche ano, segmento e tribunal | **Passou** | 22 testes de unidade e 5 de integração; os 74 números da planilha são válidos e identificam o tribunal | — |
| 3 | Prazo confere com contagem manual em ≥ 20 casos (recesso, feriado municipal, portal, dobro) | **Passou localmente** | 33 casos com contagem manual dia a dia, todos conferem (inclui recesso, feriado municipal, portal com e sem consulta, dobro, criminal, expediente reduzido, sede do tribunal, Justiça Federal) | Conferência dos casos por advogado (B12), em `docs/casos-de-prazo.md` |
| 4 | Memória de cálculo exibida em todo prazo | **Passou** | Memória obrigatória no banco (automática ou manual); exibida na prévia antes de gravar e em cada prazo da ficha; testes de integração e no navegador | — |
| 5 | Assistente não consegue excluir registro, nem por chamada direta ao servidor | **Passou** | Teste chama a ação do servidor diretamente com sessão de assistente: recusada para todos os tipos de registro; exclusão física bloqueada no próprio banco | — |
| 6 | Toda alteração aparece no histórico com usuário e data | **Passou** | Gatilho no banco grava criação, alteração e exclusão com usuário e data e recusa escrita sem usuário; histórico imutável. Na importação real, 100% dos registros criados têm a criação no histórico, atribuída ao usuário que importou (exceto a comarca de Goiânia, da carga inicial) | — |
| 7 | Painel mostra os mesmos totais da aba Relatório após a importação | **Passou, com diferenças explicadas** | `scripts/conferir-painel.ts` recalcula a aba Relatório pelas fórmulas da planilha e compara: 50 indicadores, todos iguais ou com diferença explicada (abaixo) | Confirmar a definição de "cadastros incompletos" |
| 8 | Exportação em Excel e PDF dos relatórios da seção 6 | **Passou** | Os 10 relatórios da seção 6, a lista de processos e a ficha do cliente exportados nos dois formatos com os dados reais (até 6 páginas de PDF); testes reabrem os arquivos gerados | — (cabeçalho completo: OAB/GO 001793, e-mail e logotipo) |
| 9 | Restauração de backup testada | **Passou localmente** | Backup cifrado da base real importada, restaurado em banco vazio: contagens idênticas, RLS e histórico somente leitura preservados, painel confere; senha errada recusada | Agendar o backup no servidor físico do escritório e repetir a restauração com o banco do Supabase |
| 10 | Telas utilizáveis em celular | **Passou localmente** | 17 telas percorridas no navegador em 390 px e 1280 px, sem erro e sem rolagem lateral; fluxo "andamento com prazo" e importação completos no celular | Uso pelos sócios nos próprios aparelhos |

## Critério 7 — diferenças explicadas

| Indicador | Planilha | Sistema | Motivo |
| --- | --- | --- | --- |
| Clientes cadastrados / ativos | 49 | 51 | Clientes compostos separados em duas pessoas (C1) e o registro C049 não é pessoa |
| Processos cadastrados / ativos | 81 | 83 | 2 processos relacionados criados a partir das observações (C4) |
| Status "Em andamento" | 59 | 61 | Os mesmos 2 relacionados |
| Área "Bancário/Consumidor" e "Família e Sucessões" | 43 / 5 | 44 / 6 | Os mesmos 2 relacionados (1 em cada área) |
| Instituições que contêm "Master" | 1 | 2 | A empresa co-executada do registro C033 estava na coluna Cliente e passou a ser parte (C1) |

Conferem exatamente: processos sem número (7), prazos vencidos (0), prazos dos próximos dias
(0), os demais status e áreas e as outras 21 instituições da aba Relatório.

Sem equivalente direto: a planilha conta 9 "registros a confirmar"; o sistema conta 134
"cadastros incompletos", pela definição da seção 6 (clientes sem CPF ou contato — nenhum cliente
tem CPF na planilha —, processos sem número, juízo, comarca ou data de distribuição, e os
marcados na importação). A contagem "por tipo de parte contrária" da planilha usa a coluna de
texto; o sistema usa a categoria de cada pessoa, depois das separações e mesclagens.

## Verificações além da lista

- 267 testes automatizados, checagem de tipos e build de produção: sem erros.
- API pública do banco fechada (RLS em todas as tabelas, sem privilégios para `anon` e
  `authenticated`): verificado localmente; será verificado no Supabase pela etapa `verificar`
  do script de implantação.
- Login com senha e 2FA real: depende do projeto Supabase.

## Para fechar a fase 1

1. Implantação no Supabase (`docs/implantacao-supabase.md`) e hospedagem (Vercel).
2. Importação real pela tela de revisão e conferência do relatório pelos sócios.
3. Conferência dos casos de prazo por advogado (B12).
4. Backup agendado no servidor físico do escritório e restauração testada com o banco de produção.
5. Uso pelos sócios no celular.
