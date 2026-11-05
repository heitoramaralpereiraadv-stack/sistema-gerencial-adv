#!/usr/bin/env bash
# Backup diário do banco (A10, opção sem custo): roda num computador do escritório pelo
# agendador (cron, ou Agendador de Tarefas do Windows com WSL/Git Bash).
#  - dump do esquema public (dados do sistema) e das contas de acesso (auth), cifrados com
#    AES-256 antes de gravar em disco;
#  - mantém os 30 mais recentes (seção 7: retenção de 30 dias);
#  - aos domingos, copia para a pasta da cópia semanal fora do provedor (ex.: HD externo).
#
# Variáveis: BANCO_URL (conexão direta, porta 5432), BACKUP_SENHA (frase longa, guardada
# com os sócios), BACKUP_PASTA, BACKUP_PASTA_SEMANAL (opcional).
# Requer pg_dump da mesma versão principal do Postgres do Supabase, ou mais nova.
set -euo pipefail
: "${BANCO_URL:?defina BANCO_URL}" "${BACKUP_SENHA:?defina BACKUP_SENHA}" "${BACKUP_PASTA:?defina BACKUP_PASTA}"
RETENCAO=${RETENCAO:-30}
mkdir -p "$BACKUP_PASTA"
carimbo=$(date +%Y-%m-%d_%H%M)
destino="$BACKUP_PASTA/sistema-gerencial_$carimbo.tar.enc"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

pg_dump "$BANCO_URL" --format=custom --no-owner --no-privileges --schema=public --file="$tmp/public.dump"
# Contas de acesso (Supabase Auth), só dados: permitem restaurar os logins com os mesmos ids.
if psql "$BANCO_URL" -Atc "select 1 from information_schema.schemata where schema_name='auth'" | grep -q 1; then
  pg_dump "$BANCO_URL" --format=custom --no-owner --no-privileges --data-only \
    --table=auth.users --table=auth.identities --table=auth.mfa_factors --file="$tmp/auth.dump"
fi
date -Iseconds > "$tmp/CRIADO_EM"
tar -C "$tmp" -cf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_SENHA -out "$destino"
echo "Backup gravado: $destino ($(du -h "$destino" | cut -f1))"

# Retenção: apaga os mais antigos além dos $RETENCAO mais recentes.
ls -1t "$BACKUP_PASTA"/sistema-gerencial_*.tar.enc | tail -n +$((RETENCAO + 1)) | xargs -r rm --
# Cópia semanal fora do provedor principal (domingo).
if [ -n "${BACKUP_PASTA_SEMANAL:-}" ] && [ "$(date +%u)" = "7" ]; then
  mkdir -p "$BACKUP_PASTA_SEMANAL" && cp "$destino" "$BACKUP_PASTA_SEMANAL/"
  echo "Cópia semanal: $BACKUP_PASTA_SEMANAL"
fi
