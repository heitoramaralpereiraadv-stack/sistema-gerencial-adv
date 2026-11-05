#!/usr/bin/env bash
# Restauração de um backup (seção 7: teste de restauração a cada trimestre).
# Uso: BACKUP_SENHA=… DESTINO_URL=postgresql://…/banco_de_teste scripts/backup/restaurar.sh <arquivo.tar.enc>
# Restaura o esquema public num banco VAZIO (de teste ou novo projeto) e confere as contagens.
set -euo pipefail
arquivo=${1:?informe o arquivo .tar.enc}
: "${BACKUP_SENHA:?defina BACKUP_SENHA}" "${DESTINO_URL:?defina DESTINO_URL}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_SENHA -in "$arquivo" -out "$tmp/backup.tar" 2>/dev/null; then
  echo "Não foi possível decifrar: senha errada ou arquivo corrompido." >&2
  exit 1
fi
tar -C "$tmp" -xf "$tmp/backup.tar" && rm "$tmp/backup.tar"
echo "Backup criado em $(cat "$tmp/CRIADO_EM")"
if psql "$DESTINO_URL" -Atc "select count(*) from pg_tables where schemaname='public'" | grep -qv '^0$'; then
  echo "O banco de destino já tem tabelas em public; use um banco vazio." >&2
  exit 1
fi
# O esquema public já existe em qualquer banco novo: restaura tudo menos a criação dele.
pg_restore --list "$tmp/public.dump" | grep -v ' SCHEMA - public ' > "$tmp/itens.lista"
pg_restore --dbname="$DESTINO_URL" --no-owner --no-privileges --exit-on-error --use-list="$tmp/itens.lista" "$tmp/public.dump"
psql "$DESTINO_URL" -c "select
  (select count(*) from pessoa) as pessoas, (select count(*) from processo) as processos,
  (select count(*) from prazo) as prazos, (select count(*) from andamento) as andamentos,
  (select count(*) from historico) as historico, (select count(*) from \"_prisma_migrations\") as migracoes"
[ -f "$tmp/auth.dump" ] && echo "Contas de acesso (auth) presentes no backup: restaure no projeto Supabase novo com pg_restore --data-only."
echo "Restauração concluída."
