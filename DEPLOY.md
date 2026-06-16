# Deploy VPS — Ordin Flow Backend

Guia completo para implantar o backend em VPS Linux (Ubuntu 24.04+), incluindo:

- **Node.js** — API Fastify
- **PostgreSQL** — banco de dados
- **Prisma** — ORM e schema
- **PM2** — API + serviço Whisper STT
- **Whisper STT** — transcrição de áudio (Python/FastAPI)
- **Nginx** — proxy reverso
- **SSL** — Let's Encrypt ou Cloudflare

Repositório: https://github.com/jvt13/api_agenda_ordin

---

## Arquitetura

```text
Cliente (app mobile)
        │
        ▼
   Nginx :80/443
        │
        ▼
  api-ordin-flow :3100  ──HTTP──►  whisper-stt :8001
        │                              (FastAPI + faster-whisper)
        ▼
   PostgreSQL :5432
```

A API Node **não transcreve áudio**. Ela encaminha arquivos para o serviço Whisper em `STT_SERVICE_URL` (padrão `http://localhost:8001`).

---

## 1. Pacotes do sistema

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Python + FFmpeg (Whisper STT)
sudo apt install -y python3 python3-venv python3-pip ffmpeg

# PM2 e Nginx
sudo npm install -g pm2
sudo apt install -y nginx

node -v      # v20.x+
python3 -V   # 3.10+
ffmpeg -version
```

---

## 2. PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER ordin WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';
CREATE DATABASE ordin OWNER ordin;
GRANT ALL PRIVILEGES ON DATABASE ordin TO ordin;
\q
```

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

## 3. Clonar e configurar o projeto

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www

git clone https://github.com/jvt13/api_agenda_ordin.git
cd api_agenda_ordin
```

Copie e edite o `.env`:

```bash
cp .env.example .env
nano .env
```

Variáveis **obrigatórias**:

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

GEMINI_API_KEY=sua-chave-gemini

CORS_ORIGIN=https://api-ordin.srv-jvt.com
```

Variáveis **Whisper STT** (necessárias para voz):

```env
STT_PROVIDER=local
STT_SERVICE_URL=http://localhost:8001
STT_PORT=8001
STT_TIMEOUT_MS=120000
WHISPER_MODEL=small
WHISPER_LANGUAGE=pt
```

Gerar segredos JWT:

```bash
openssl rand -base64 48
```

> `STT_PORT` deve coincidir com a porta em `STT_SERVICE_URL`.

---

## 4. Build Node + Prisma

```bash
cd /var/www/api_agenda_ordin

npm install
npm run build
```

O `postinstall` executa `prisma generate` automaticamente.

Na **primeira inicialização**, o bootstrap da API:

- conecta ao PostgreSQL;
- cria o banco se não existir;
- executa `prisma db push`;
- valida as tabelas.

Opcional (antes do PM2):

```bash
npx prisma db push
```

---

## 5. PM2 — API + Whisper STT

O arquivo `ecosystem.config.js` sobe **dois processos**:

| Nome PM2         | Descrição              | Porta |
|------------------|------------------------|-------|
| `api-ordin-flow` | API Node (Fastify)     | 3100  |
| `whisper-stt`    | Whisper STT (FastAPI)  | 8001  |

```bash
cd /var/www/api_agenda_ordin

chmod +x services/stt/start.sh
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Siga a instrução exibida por `pm2 startup` (comando `sudo env ...`).

### Primeira execução do Whisper

Na primeira subida, o `start.sh`:

1. cria o venv em `services/stt/.venv`;
2. instala dependências Python (`faster-whisper`, `fastapi`, `uvicorn`);
3. baixa o modelo Whisper (`WHISPER_MODEL`, ex.: `small` ≈ 500 MB);
4. inicia o uvicorn.

Isso pode levar **vários minutos**. Acompanhe:

```bash
pm2 logs whisper-stt
```

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
# API Node
curl http://127.0.0.1:3100/health

# Whisper STT
curl http://127.0.0.1:8001/health
```

Resposta esperada do STT:

```json
{"status":"ok","model":"small","language":"pt"}
```

### Logs na inicialização da API

Se o Whisper estiver acessível:

```text
[STT] Online
```

Se não estiver rodando:

```text
[STT] Offline
```

A API **sobe normalmente** mesmo com STT offline, mas endpoints de voz retornarão erro 503 até o `whisper-stt` estar ativo.

---

## 6. Iniciar Whisper manualmente (alternativa)

```bash
cd /var/www/api_agenda_ordin
bash services/stt/start.sh
```

Use apenas para debug. Em produção, prefira PM2.

---

## 7. Nginx (proxy reverso)

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

> O serviço Whisper (`:8001`) **não** precisa ser exposto pelo Nginx — apenas a API Node acessa localmente.

---

## 8. SSL

### Opção A — Cloudflare (proxy)

| Tipo | Nome      | Conteúdo   | Proxy   |
|------|-----------|------------|---------|
| A    | api-ordin | IP_DA_VPS  | Proxied |

SSL/TLS → **Full** ou **Full (strict)**.

### Opção B — Let's Encrypt na VPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api-ordin.srv-jvt.com
```

---

## 9. Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Portas **3100** e **8001** ficam apenas em `localhost` — não abrir externamente.

---

## 10. Atualização (deploy de nova versão)

```bash
cd /var/www/api_agenda_ordin
git pull
npm install
npm run build
pm2 restart ecosystem.config.js
```

Se `services/stt/requirements.txt` mudou:

```bash
pm2 restart whisper-stt
```

---

## 11. Logs esperados na inicialização

**API Node:**

```text
✅ PostgreSQL acessível
✅ Banco conectado: ordin
✅ Prisma Client gerado
✅ Schema Prisma sincronizado
✅ Tabelas validadas
[STT] Online
✅ API iniciada na porta 3100
```

**Whisper STT:**

```text
[STT] Criando ambiente virtual...
[STT] Instalando dependências Python...
[STT] Iniciando uvicorn em 0.0.0.0:8001 (modelo=small)
[STT] Carregando modelo Whisper 'small'...
[STT] Modelo carregado em 12.3s
```

---

## 12. Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `curl localhost:8001` → Connection refused | `whisper-stt` não rodando | `pm2 start ecosystem.config.js` ou `pm2 restart whisper-stt` |
| `[STT] Offline` nos logs da API | STT ainda carregando ou parado | `pm2 logs whisper-stt` — aguarde download do modelo |
| Erro 503 em endpoint de voz | Whisper indisponível | Verifique `pm2 status` e porta 8001 |
| Erro 502 genérico em voz | Falha interna no Whisper | `pm2 logs whisper-stt` — verifique FFmpeg e memória |
| `python3 não encontrado` | Python não instalado | `sudo apt install -y python3 python3-venv ffmpeg` |
| `.venv/bin/activate: No such file` | venv incompleto ou `python3-venv` ausente | `sudo apt install -y python3-venv && rm -rf services/stt/.venv && pm2 restart whisper-stt` |
| OOM / processo reinicia | Modelo grande demais para RAM | Use `WHISPER_MODEL=tiny` ou `base` |
| 502 Bad Gateway (Nginx) | API Node parada | `pm2 status api-ordin-flow` |
| `password authentication failed` | Credenciais PG incorretas | Confira `DATABASE_USER` e `DATABASE_PASSWORD` |

### Diagnóstico rápido STT

```bash
pm2 status
ss -tulpn | grep 8001
curl http://127.0.0.1:8001/health
pm2 logs whisper-stt --lines 50
```

---

## 13. Comandos resumidos (VPS limpa)

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
cd api_agenda_ordin
cp .env.example .env && nano .env
npm install && npm run build
chmod +x services/stt/start.sh
pm2 start ecosystem.config.js && pm2 save && pm2 startup

# Verificar
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:8001/health
```

---

## Estrutura do serviço Whisper

```text
backend/
├── services/stt/
│   ├── app.py              # FastAPI — /health e /transcribe
│   ├── requirements.txt    # faster-whisper, uvicorn, fastapi
│   └── start.sh            # venv + uvicorn (porta STT_PORT)
├── ecosystem.config.js     # PM2: api-ordin-flow + whisper-stt
└── src/providers/stt.provider.ts  # integração Node → Whisper
```
