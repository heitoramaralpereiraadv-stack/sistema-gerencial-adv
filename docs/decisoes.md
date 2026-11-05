# Decisões do projeto

Registro das respostas dos sócios às dúvidas da etapa 1. Itens não listados continuam pendentes.

| Item | Decisão |
| --- | --- |
| A1 | Hospedagem na Vercel, com funções na região gru1 (São Paulo). |
| A2 | O painel deve bater com a planilha nos indicadores de mesma definição (processos, status, área, sem número); nos demais, o relatório de importação explica a diferença. |
| A3 | Exclusão lógica em campo próprio (`excluidoEm`), separada do status processual "Arquivado". |
| A4 | Acordo homologado equivale a sentença prolatada: forma de conclusão, não definitiva. Comportamento `CONCLUIDO_NAO_DEFINITIVO`: grava resultado ACORDO e a data da homologação como data do resultado; conta em Resultados e nas sentenças do mês; o processo segue ativo e aceita prazos. (Confirmado.) |
| A5 | Qualificação é lista editável, iniciada com a união da seção 3 e da planilha. Uma parte pode ter várias qualificações ("Executado (avalista)" → executado + avalista). |
| A6 | Tipo: PF, PJ, Espólio, Ente público. Categoria só para PJ: instituição financeira, seguradora, empresa. |
| A7 | Lista de classes começa vazia. |
| A8 | Status editáveis em nome e ordem; comportamento fixo por status. |
| A9 | Processo ganha: data de encerramento, motivo e data de suspensão, resultado e data do resultado, cadastro incompleto, exclusão lógica. |
| A10 | Backup na opção gratuita ou mais econômica possível (ver plano na etapa 2). |
| A11 | Suspensa até análise dos sócios (timeout de 8 h / plano do Supabase). |
| A12 | 2FA somente por aplicativo autenticador (TOTP), por ora. |
| CNJ | Número com dígito verificador válido e tribunal fora da tabela é aceito, com tribunal em branco. |
| Prazos | Motor aprovado como apresentado na etapa 3; pendências B1–B5 bloqueiam o cálculo até decisão. |
| D9 | Assistente marca prazo como cumprido (não cria nem edita prazos e audiências). Advogado cria e edita prazos e audiências. |
| D10 | Remover parte de um processo ou contato de um cadastro é edição (assistente pode), registrada no histórico. |
| D5 | Cifrar dados críticos: números de documentos (CPF/CNPJ, RG e demais documentos), dados fiscais e de caráter personalíssimo (campo "Informações reservadas"). Observações e andamentos ficam pesquisáveis, em claro. |
| D11 | Quando o motor não define a regra (pendências B), o usuário lança a data final manualmente; justificativa facultativa. O prazo fica marcado como "contado manualmente". |
| B9 | Demais formas de intimação: o usuário informa a data da intimação e o sistema conta a partir dela. |
| B11 | Feriados iniciais: nacionais 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12; Goiânia 24/05 e 24/10; móveis: Carnaval e Sexta-feira da Semana Santa (ano a ano). Locais: depois. |
| D12 | Agenda e alertas contam dias úteis pelo calendário de cada processo. |
| D13 | Prazo vencido fica "vencido" (cinza, com destaque) até alguém marcar cumprido ou perdido; não muda sozinho. |
| D14 | Advogado e assistente podem cadastrar comarcas; editar, mesclar e desativar é do administrador. |
| D15 | Tipo de audiência é lista editável pelo administrador, começando vazia. |
| D16 | Quem confere o prazo é o responsável pelo prazo, qualquer que seja o perfil. |
| D17 | Ajuste da data final: advogado e administrador; o ajuste desfaz a conferência. |
| B13 | Carnaval: segunda e terça são feriado; Quarta-feira de Cinzas é expediente reduzido. |
| D1 | Advogado não exclui registros (só administrador). |
| D2 | "Ver só os seus" é configurado por usuário pelo administrador; "seus" = processos de que é responsável. |
| D3 | Assistente vê todos os processos, exceto os em segredo de justiça. |
| D6 | Registro de acessos entra na fase 1; exportação e anonimização depois da decisão sobre prazo de guarda. |
| D8 | E-mail do sistema: escritorio@medeirosebarbosa.com.br, provedor GoDaddy (SMTP configurado no Supabase). |
| C1 | Clientes compostos: C007, C008 e C041 → duas pessoas cada, todas clientes; C010 → só uma das pessoas é cliente (a outra é parte contrária); C013 → uma pessoa física é a cliente (caso a detalhar pelos sócios); C033 → só a pessoa física é cliente (a empresa fica como co-executada, não cliente); C049 → o exequente é o cliente C043 e o escritório é depositário. Nomes completos em `importacao-ajustes.local.json` (fora do repositório). |
| C2 | Banco ou INSS como parte contrária: presume-se polo passivo (requerido). Bancos raramente são agrupados no polo passivo: nomes de bancos ligados por "/" são tratados como o mesmo réu. O importador sugere a separação e a revisão decide caso a caso. |
| C3 | A parte contrária "Shopping (queda em escada rolante)" é do processo P008 (a identificar). Demais casos: cadastro incompleto, a preencher depois. |
| C4 | Números das observações com número completo viram processos relacionados aos mesmos clientes do processo de origem (P010 e P046). Números incompletos ficam como texto e pendência. |
| C5 | Reproposituras sem a ação original: pendência "informar a ação original". |
| C6 | "Fase atual" vai para o campo fase; "Tema 1414/STJ" vira motivo do sobrestamento. P017: verificar depois, sem alterar partes. |
| C7 | Com número CNJ, tribunal e comarca vêm do número; sem número, comarca e juízo são informados manualmente depois. |
| C8 | Administradores: Silas e Taciano. Rute deixou a sociedade (atua em processos pontuais). Heitor Amaral Pereira: advogado. Responsável pelos processos importados: Silas. E-mails informados na conversa (não versionados). |
| B1 | Os dias do recesso não são dias úteis, inclusive para a publicação (regra 2) e o início do prazo (regra 4). |
| B2 | O recesso vale para todas as esferas e todos os prazos, inclusive os contados em dias corridos. |
| B3 | Dias corridos: se o prazo for criminal, início e vencimento em dia não útil passam para o dia útil seguinte; nos demais, contagem manual. |
| B4 | Portal sem consulta: se o 10º dia não for útil, considera-se a intimação no dia útil anterior (por segurança). |
| B5 | Portal com consulta em dia não útil: aplica-se a Lei 11.419/2006, art. 5º, §2º (intimação no primeiro dia útil seguinte). |
| B6 | Expediente reduzido conta como dia útil no início e no meio do prazo (por segurança); vencimento nele continua prorrogado (regra 8). |
| B8 | Justiça Federal: só feriados nacionais (e os registros do próprio tribunal). Justiça do Trabalho: todos os locais. 2º grau e Turmas Recursais: feriados da sede do tribunal. |
| B12 | Conferência dos casos de prazo: em momento posterior. |
| B6 | Confirmado: expediente reduzido conta como dia útil no início e no meio; vencimento nele é prorrogado (regra 8). |
| B8 | Confirmado, inclusive os registros do próprio tribunal na Justiça Federal. |
| B9 | Data de intimação informada em dia não útil: considera-se no primeiro dia útil seguinte. |
| Importação | BRB – Banco de Brasília e BRB Crédito, Financiamento e Investimento são pessoas distintas (não mesclar). |
| C8 | Rute: perfil Advogada. Heitor Amaral Pereira: perfil Advogado (nome confirmado). E-mails informados na conversa (não versionados). |
| D7 | Cabeçalho: Medeiros e Barbosa Sociedade de Advogados, CNPJ 24.605.755/0001-88, Av. T-7, nº 371, Sala 1208, Ed. Lourenço Office, Setor Oeste, Goiânia/GO, CEP 74140-110, (62) 3928-0055. Pendentes: registro na OAB, e-mail e logotipo. |
