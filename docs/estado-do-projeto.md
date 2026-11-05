# Estado do projeto (05/11/2026)

Fase 1 (MVP), conforme a seção 1 dos requisitos. Plano em 8 etapas, com conferência dos sócios
ao fim de cada uma.

| Etapa | Situação |
| --- | --- |
| 1. Dúvidas e contradições | Concluída (respostas em `docs/decisoes.md`) |
| 2. Schema e pastas | Concluída |
| 3. Número CNJ e motor de prazos | Concluída; 33 casos em `docs/casos-de-prazo.md` (conferência por advogado pendente, B12) |
| 4. Autenticação, perfis, permissões | Concluída (login real depende do Supabase) |
| 5. Telas | Concluída |
| 6. Importação da planilha | Concluída; prévia com a planilha real conferiu com a aba Relatório |
| 7. Painel e relatórios (Excel/PDF) | Concluída |
| Implantação no Supabase | Script pronto (`npm run supabase`); aguarda rede e segredos (`docs/implantacao-supabase.md`) |
| Backup e restauração | Scripts prontos e restauração testada localmente (`scripts/backup/`) |
| 8. Relatório dos critérios de aceite | Feito antes da implantação (`docs/relatorio-aceite.md`); itens externos pendentes |

## Arquivos locais fora do repositório (contêm dados reais)
- `importacao-ajustes.local.json` — separações de clientes compostos (C1), registro C049,
  BRB não mesclar. Enviado na importação junto com a planilha.
- `usuarios-iniciais.local.json` — nome, e-mail e perfil de Silas, Taciano, Rute, Heitor.
- `.env.producao` — gerado pela etapa `chaves` do script de implantação.

## Pendências dos sócios
- **A11** — plano do Supabase e expiração da sessão por inatividade.
- **D8** — plano de e-mail na GoDaddy (Professional Email ou Microsoft 365).
- **E1** — repositório do código. **E2** — projeto Supabase e segredos.
- **Google Agenda** — decidido (G1–G4); falta confirmar como identificar o processo de um evento (ver decisões).
- **B12** — conferência dos casos de prazo por advogado.
- **Seção 7** — encarregado de dados (DPO). Prazo de guarda decidido: 2 anos após o encerramento.
- **Confirmar** — definição de "com sentença" na movimentação mensal (andamento Sentença ou data
  de sentença/homologação) e de "cadastros incompletos" (inclui processo sem comarca e os
  marcados na importação).
- **Revisão da importação** — conferir na tela de revisão: Empreendimentos Ingá / Shopping Avenida
  Center (P026), BMG Seguradora (P058), "EB Produtos Farmacêuticos e Eli e Su" (P028), P017.
