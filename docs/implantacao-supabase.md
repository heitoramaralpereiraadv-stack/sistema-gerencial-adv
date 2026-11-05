# Implantação no Supabase

O que os sócios fazem no painel (cerca de 15 minutos) e o que o Claude roda depois, pelo
script `npm run supabase`. Nenhuma senha ou chave é colada no chat: tudo vai para os
segredos do ambiente ou para o painel do Supabase.

## Parte 1 — no painel do Supabase (sócios)

1. **Conta**: em <https://supabase.com>, crie a conta do escritório (de preferência com o
   e-mail do escritório) e uma organização "Medeiros e Barbosa".
2. **Plano** (decisão A11, pendente):
   - *Free*: sem custo; o projeto é **pausado após 7 dias sem uso**, não há backup gerenciado
     e não há expiração de sessão por inatividade. Serve para teste.
   - *Pro* (cobrança mensal; conferir o valor na página de preços): sem pausa, backups diários
     gerenciados e expiração da sessão por inatividade (as 8 horas da seção 7).
   - Em qualquer plano, o backup próprio cifrado (Parte 4) cumpre os 30 dias e a cópia fora
     do provedor.
3. **Projeto**: *New project* → nome `sistema-gerencial-mb` → região **South America (São
   Paulo)** → gere a senha do banco e **guarde-a no gerenciador de senhas do escritório**.
4. **Token de implantação**: *Account → Access Tokens → Generate new token* (nome
   `implantacao-claude`). Ele dá acesso de administrador à conta: será **revogado** ao fim da
   implantação (Parte 3, passo 5).
5. **Identificador do projeto**: *Project Settings → General → Project ID* (algo como
   `abcdefghijklmnopqrst`).

## Parte 2 — no ambiente desta sessão do Claude (sócios)

No menu do ambiente (título da sessão → *Edit*):

1. **Acesso de rede** → *Allowed domains*: incluir `api.supabase.com` e
   `<project-id>.supabase.co`, mantendo marcado *Allow package managers*.
2. **Segredos / variáveis de ambiente** (nunca no chat):

   | Variável | Valor |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | o token do passo 4 |
   | `SUPABASE_PROJECT_REF` | o Project ID do passo 5 |
   | `SUPABASE_DB_PASSWORD` | a senha do banco do passo 3 |
   | `SMTP_PASSWORD` | senha da caixa escritorio@medeirosebarbosa.com.br |
   | `SMTP_HOST` / `SMTP_PORT` | GoDaddy *Professional Email*: `smtpout.secureserver.net` / `465`. *Microsoft 365 pela GoDaddy*: `smtp.office365.com` / `587`, com "SMTP autenticado" habilitado na caixa |

3. Abra uma **nova sessão** (é ela que recebe a rede e os segredos) neste mesmo projeto e
   peça: "rode a implantação no Supabase conforme docs/implantacao-supabase.md".

## Parte 3 — o que o Claude roda

`npm run supabase -- tudo` executa, nesta ordem (cada etapa pode ser repetida):

| Etapa | O que faz |
| --- | --- |
| `api` | Confere região (sa-east-1), situação do projeto e a especificação publicada da API |
| `auth` | Cadastro público desligado, 2FA por aplicativo, sem SMS, senha mínima de 12, modelos de convite e de redefinição em português, SMTP do escritório. Recusa-se a rodar se a API não aceitar algum campo |
| `banco` | Aplica as migrações (RLS em todas as tabelas, histórico por gatilho, bloqueio de exclusão física) e a carga inicial: tribunais, listas, status, feriados de três anos, dados do escritório |
| `chaves` | Grava `.env.producao` (fora do repositório) com a conexão do banco, as chaves do projeto e as **chaves de cifragem** geradas uma única vez |
| `usuarios` | Convida Silas e Taciano (administradores), Rute e Heitor (advogados), a partir de `usuarios-iniciais.local.json` |
| `verificar` | Confere RLS, privilégios, migrações, carga, Auth e tenta ler as tabelas pela chave pública (deve ser recusado) |

Depois da implantação:

4. **Chaves de cifragem**: `CHAVE_CIFRAGEM` e `CHAVE_INDICE` de `.env.producao` vão para o
   gerenciador de senhas **e** para a hospedagem. Sem a `CHAVE_CIFRAGEM`, CPF, RG e dados
   reservados ficam ilegíveis para sempre.
5. **Revogar** o token de implantação (*Account → Access Tokens*).
6. **Hospedagem (Vercel, A1)**: com as variáveis de `.env.producao`, função na região
   `gru1`. Com o endereço definitivo, rodar de novo `npm run supabase -- auth` com
   `SITE_URL` para fixar os endereços de retorno dos e-mails.
7. **Primeiro acesso**: cada usuário abre o convite, define a senha e cadastra o aplicativo
   autenticador.
8. **Importação da planilha**: em *Configurações → Importação da planilha*, enviar a
   planilha e `importacao-ajustes.local.json`, revisar e gravar.

## Parte 4 — backup (A10, sem custo)

No servidor físico do escritório (Linux, macOS ou Windows com WSL), com o cliente do PostgreSQL
na mesma versão do Supabase ou mais nova:

```bash
export BANCO_URL="<Project Settings → Database → Connection string → Direct (porta 5432)>"
export BACKUP_SENHA="<frase longa, guardada com os sócios>"
export BACKUP_PASTA="$HOME/backups-sistema"
export BACKUP_PASTA_SEMANAL="/media/hd-externo/backups-sistema"   # cópia fora do provedor
scripts/backup/backup.sh
```

Agendar diariamente (ex.: `cron` às 22h). Mantém 30 cópias; aos domingos copia para o HD
externo. Os arquivos saem **cifrados** (AES-256).

**Teste de restauração (trimestral)**: num banco vazio de teste,

```bash
BACKUP_SENHA=… DESTINO_URL=postgresql://…/banco_de_teste scripts/backup/restaurar.sh <arquivo>.tar.enc
```

O script recusa banco que não esteja vazio e mostra as contagens para comparar com o sistema.
Testado em 04/11/2026 com o banco de desenvolvimento: contagens idênticas, RLS e histórico
somente leitura preservados, senha errada recusada.

## Google Agenda (depois da hospedagem)

1. Defina `NEXT_PUBLIC_SITE_URL` na Vercel com o endereço público do sistema (o endereço de
   assinatura usa esse valor).
2. Em Configurações › Google Agenda, o administrador liga o envio e adiciona o endereço no
   Google Agenda (Outras agendas › Do URL). O Google atualiza a agenda assinada por conta
   própria, em geral em algumas horas.
3. Para trazer a agenda atual: no Google, Configurações › Importar e exportar › Exportar; envie o
   .zip na mesma tela e revise os eventos antes de gravar.
