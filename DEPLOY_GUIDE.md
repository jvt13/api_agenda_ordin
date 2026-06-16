# DEPLOY_GUIDE — Ordin Flow (Backend + Whisper)

Guia operacional completo para implantar e manter o sistema em produção **sem depender de memória ou conhecimento externo**.

Domínio de referência: `api-ordin.srv-jvt.com`

Repositório: https://github.com/jvt13/api_agenda_ordin

---

## Índice

1. [Arquitetura](#1-arquitetura)
2. [Preparação da VPS](#2-preparação-da-vps)
3. [Clonagem do projeto](#3-clonagem-do-projeto)
4. [Configuração do banco PostgreSQL](#4-configuração-do-banco-postgresql)
5. [Configuração do backend (.env mínimo)](#5-configuração-do-backend-env-mínimo)
6. [Build Node + Prisma](#6-build-node--prisma)
7. [Configuração do Whisper STT](#7-configuração-do-whisper-stt)
8. [Configuração PM2](#8-configuração-pm2)
9. [Configuração Nginx](#9-configuração-nginx)
10. [SSL](#10-ssl)
11. [Painel administrativo (Configurações do Sistema)](#11-painel-administrativo-configurações-do-sistema)
12. [Health check operacional](#12-health-check-operacional)
13. [Atualização do sistema](#13-atualização-do-sistema)
14. [Troubleshooting](#14-troubleshooting)
15. [Comandos resumidos (VPS limpa)](#15-comandos-resumidos-vps-limpa)

---

## 1. Arquitetura

```text
App mobile (APK)
        │
        ▼
   Nginx :443
        │
        ▼
  api-ordin-flow :3100  ──HTTP──►  whisper-stt :8001
        │                              (Python/FastAPI + faster-whisper)
        ▼
   PostgreSQL :5432
        │
        ▼
  system_settings (chaves Gemini, STT, Cloudinary criptografadas)
```

| Componente | Função | Porta exposta |
|------------|--------|---------------|
| Nginx | Proxy reverso + SSL | 80/443 |
| API Node (Fastify) | Auth, tarefas, admin | 3100 (localhost) |
| Whisper STT | Transcrição de áudio | 8001 (localhost) |
| PostgreSQL | Persistência | 5432 (localhost) |

A API **não transcreve** áudio. Ela encaminha para o Whisper em `STT_SERVICE_URL`.

---

## 2. Preparação da VPS

Ubuntu 24.04+ recomendado.

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Python + FFmpeg (Whisper)
sudo apt install -y python3 python3-venv python3-pip ffmpeg

# PM2 e Nginx
sudo npm install -g pm2
sudo apt install -y nginx

node -v      # v20.x+
python3 -V   # 3.10+
ffmpeg -version
psql --version
```

---

## 3. Clonagem do projeto

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www

git clone https://github.com/jvt13/api_agenda_ordin.git
cd api_agenda_ordin/backend
```

### Estrutura esperada

```text
backend/
├── prisma/schema.prisma
├── src/                    # API Fastify
├── services/stt/           # Whisper (Python)
│   ├── app.py
│   ├── requirements.txt
│   └── start.sh
├── ecosystem.config.js     # PM2
├── DEPLOY_GUIDE.md         # Este arquivo
└── .env                    # Apenas segredos de bootstrap
```

---

## 4. Configuração do banco PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER ordin WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';
CREATE DATABASE ordin OWNER ordin;
GRANT ALL PRIVILEGES ON DATABASE ordin TO ordin;
\q
```

Validação:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
psql -h localhost -U ordin -d ordin -c "SELECT 1;"
```

---

## 5. Configuração do backend (.env mínimo)

```bash
cp .env.example .env
nano .env
```

### Obrigatório no .env (permanece no servidor)

```env
PORT=3100
NODE_ENV=production

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=ordin
DATABASE_PASSWORD=SUA_SENHA_FORTE_AQUI
DATABASE_NAME=ordin
DATABASE_SCHEMA=public

JWT_SECRET=gere-um-segredo-aleatorio-com-32-caracteres-ou-mais
JWT_REFRESH_SECRET=gere-outro-segredo-aleatorio-com-32-caracteres-ou-mais

SETTINGS_ENCRYPTION_KEY=gere-chave-de-32-caracteres-ou-mais-para-criptografia

CORS_ORIGIN=https://api-ordin.srv-jvt.com
```

Gerar segredos:

```bash
openssl rand -base64 48
```

### Opcional no .env (migrado automaticamente para o banco na 1ª subida)

```env
ADMIN_BOOTSTRAP_EMAIL=admin@suaempresa.com
GEMINI_API_KEY=sua-chave-gemini
GEMINI_MODEL=gemini-2.0-flash
STT_PROVIDER=local
STT_SERVICE_URL=http://localhost:8001
WHISPER_MODEL=small
WHISPER_LANGUAGE=pt
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

> Após a primeira inicialização, chaves Gemini/STT/Cloudinary podem ser gerenciadas **pelo painel admin** (`/system/settings`) sem editar `.env` nem redeploy.

---

## 6. Build Node + Prisma

```bash
cd /var/www/api_agenda_ordin/backend

npm install
npm run build
```

Na **primeira inicialização**, o bootstrap:

- conecta ao PostgreSQL;
- cria o banco se necessário;
- executa `prisma db push`;
- migra configurações do `.env` para `system_settings`;
- valida tabelas.

Opcional antes do PM2:

```bash
npm run db:push
npm run db:seed   # demo + admin@agenda.com / 123456
```

---

## 7. Configuração do Whisper STT

### Localização

```text
backend/services/stt/
├── app.py              # FastAPI — /health e /transcribe
├── requirements.txt    # faster-whisper, uvicorn, fastapi
└── start.sh            # venv + uvicorn
```

### Instalação manual (debug)

```bash
cd /var/www/api_agenda_ordin/backend/services/stt

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export WHISPER_MODEL=small
export WHISPER_LANGUAGE=pt
export STT_PORT=8001

python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

### Testes

```bash
curl http://127.0.0.1:8001/health
```

Resposta esperada:

```json
{"status":"ok","model":"small","language":"pt"}
```

Teste de transcrição (com arquivo de áudio):

```bash
curl -X POST http://127.0.0.1:8001/transcribe \
  -F "audio=@/caminho/gravacao.m4a"
```

### Primeira execução

O `start.sh` (via PM2):

1. Cria venv em `services/stt/.venv`;
2. Instala dependências Python;
3. Baixa modelo Whisper (`small` ≈ 500 MB);
4. Inicia uvicorn.

Pode levar **vários minutos**. Acompanhe: `pm2 logs whisper-stt`.

> Alterar `WHISPER_MODEL` no painel admin **não reinicia** o processo Python. Após mudança, execute: `pm2 restart whisper-stt`.

---

## 8. Configuração PM2

Arquivo: `backend/ecosystem.config.js`

| Processo PM2 | Descrição | Porta |
|--------------|-----------|-------|
| `api-ordin-flow` | API Node | 3100 |
| `whisper-stt` | Whisper STT | 8001 |

```bash
cd /var/www/api_agenda_ordin/backend

chmod +x services/stt/start.sh
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Siga a instrução exibida por `pm2 startup` (comando `sudo env ...`).

### Comandos úteis

```bash
pm2 status
pm2 logs api-ordin-flow
pm2 logs whisper-stt
pm2 restart ecosystem.config.js
pm2 restart whisper-stt
```

### Verificar saúde

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:8001/health
```

Logs esperados na API:

```text
[SETTINGS] Configurações carregadas do banco
[STT] Online
✅ API iniciada na porta 3100
```

---

## 9. Configuração Nginx

```bash
sudo nano /etc/nginx/sites-available/api-ordin
```

```nginx
server {
    listen 80;
    server_name api-ordin.srv-jvt.com;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/api-ordin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> O Whisper (`:8001`) **não** deve ser exposto externamente.

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Portas 3100 e 8001 ficam apenas em `localhost`.

---

## 10. SSL

### Opção A — Cloudflare (proxy)

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | api-ordin | IP_DA_VPS | Proxied |

SSL/TLS → **Full** ou **Full (strict)**.

### Opção B — Let's Encrypt na VPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api-ordin.srv-jvt.com
```

Renovação automática:

```bash
sudo certbot renew --dry-run
```

---

## 11. Painel administrativo (Configurações do Sistema)

Acessível no app mobile (aba **Admin**) ou via API para usuários com `role = ADMIN`.

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/system/settings` | Listar configurações (mascaradas) |
| PUT | `/system/settings` | Atualizar configurações |
| GET | `/system/settings/audit` | Auditoria de alterações |
| GET | `/system/health` | Diagnóstico dos serviços |

### Configurações gerenciáveis

- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `STT_PROVIDER`, `STT_SERVICE_URL`
- `WHISPER_MODEL`, `WHISPER_LANGUAGE`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Primeiro administrador

1. Defina `ADMIN_BOOTSTRAP_EMAIL` no `.env` e faça login com esse e-mail, **ou**
2. Execute `npm run db:seed` — cria `admin@agenda.com / 123456` (altere a senha em produção).

### Fluxo recomendado pós-deploy

1. Login como admin no app;
2. Aba **Admin** → **Configurações**;
3. Preencha `GEMINI_API_KEY` e demais chaves;
4. Salve — entra em vigor **sem redeploy**;
5. Remova chaves sensíveis do `.env` (opcional, mantendo apenas bootstrap).

---

## 12. Health check operacional

```bash
curl -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  https://api-ordin.srv-jvt.com/system/health
```

Resposta:

```json
{
  "checkedAt": "2026-05-29T12:00:00.000Z",
  "services": [
    { "name": "API", "status": "ONLINE" },
    { "name": "PostgreSQL", "status": "ONLINE" },
    { "name": "Gemini", "status": "ONLINE", "detail": "modelo=gemini-2.0-flash" },
    { "name": "Whisper", "status": "ONLINE", "detail": "http://localhost:8001" },
    { "name": "Cloudinary", "status": "OFFLINE", "detail": "Não configurado — usando uploads locais" }
  ]
}
```

---

## 13. Atualização do sistema

```bash
cd /var/www/api_agenda_ordin/backend

git pull
npm install
npm run build
pm2 restart ecosystem.config.js
```

Se `services/stt/requirements.txt` mudou:

```bash
rm -rf services/stt/.venv
pm2 restart whisper-stt
```

Validação pós-deploy:

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:8001/health
pm2 status
```

---

## 14. Troubleshooting

### Erro 502 no áudio (APK / app mobile)

**Sintoma:** "Erro ao processar áudio — Request failed with status code 502"

**Causa:** API recebeu o áudio, mas o Whisper falhou ou está inacessível.

**Diagnóstico:**

```bash
pm2 status
curl http://127.0.0.1:8001/health
pm2 logs whisper-stt --lines 80
pm2 logs api-ordin-flow --lines 50
```

**Soluções:**

| Problema | Ação |
|----------|------|
| `whisper-stt` parado | `pm2 restart whisper-stt` |
| Connection refused em 8001 | `pm2 start ecosystem.config.js` |
| `STT_SERVICE_URL` incorreto | Corrija no painel admin ou `.env` |
| OOM / memória | Use `WHISPER_MODEL=tiny` ou `base` |
| FFmpeg ausente | `sudo apt install -y ffmpeg` |

### Banco indisponível

```bash
sudo systemctl status postgresql
psql -h localhost -U ordin -d ordin -c "SELECT 1;"
pm2 logs api-ordin-flow
```

Verifique `DATABASE_*` no `.env`.

### PM2 parado

```bash
pm2 status
pm2 resurrect
pm2 start ecosystem.config.js
pm2 save
```

### SSL expirado

```bash
sudo certbot certificates
sudo certbot renew
sudo nginx -t && sudo systemctl reload nginx
```

### Gemini indisponível

```bash
curl -H "Authorization: Bearer TOKEN" https://api-ordin.srv-jvt.com/system/health
```

- Verifique `GEMINI_API_KEY` no painel admin;
- Confirme modelo (`gemini-2.0-flash` ou `gemini-2.5-flash`);
- Teste chave em https://aistudio.google.com/

### 502 Bad Gateway (Nginx)

API Node parada:

```bash
pm2 status api-ordin-flow
pm2 restart api-ordin-flow
```

---

## 15. Comandos resumidos (VPS limpa)

```bash
# Sistema
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential postgresql postgresql-contrib \
  python3 python3-venv python3-pip ffmpeg nginx
sudo npm install -g pm2

# PostgreSQL
sudo -u postgres psql -c "CREATE USER ordin WITH PASSWORD 'SUA_SENHA';"
sudo -u postgres psql -c "CREATE DATABASE ordin OWNER ordin;"

# App
cd /var/www && git clone https://github.com/jvt13/api_agenda_ordin.git
cd api_agenda_ordin/backend
cp .env.example .env && nano .env
npm install && npm run build
chmod +x services/stt/start.sh
pm2 start ecosystem.config.js && pm2 save && pm2 startup

# Verificar
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:8001/health
```

---

## Referências

- `DEPLOY.md` — guia anterior (mantido para compatibilidade)
- `DEPLOY_VPS.md` — notas específicas VPS
- Painel admin no app — aba **Admin** (usuário ADMIN)
