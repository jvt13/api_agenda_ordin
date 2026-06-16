# Deploy VPS — Ordin Flow API (Ubuntu 24.04)

Guia para colocar o backend em produção em VPS Linux com **Node.js 20+**, **PM2**, **PostgreSQL 16**, **Nginx** e **Cloudflare**.

Repositório: https://github.com/jvt13/api_agenda_ordin

---

## 1. Instalação do sistema

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# PM2 e Nginx
sudo npm install -g pm2
sudo apt install -y nginx

node -v    # deve ser v20.x ou superior
psql --version
```

---

## 2. PostgreSQL

```bash
sudo -u postgres psql
```

No prompt do PostgreSQL:

```sql
CREATE USER ordin WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';
CREATE DATABASE ordin OWNER ordin;
GRANT ALL PRIVILEGES ON DATABASE ordin TO ordin;
\q
```

Permitir conexão local (padrão Ubuntu):

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

## 3. Clonagem do projeto

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www

git clone https://github.com/jvt13/api_agenda_ordin.git
cd api_agenda_ordin
```

---

## 4. Variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Ajuste **obrigatoriamente**:

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

# CORS: domínio do app ou API pública
CORS_ORIGIN=https://api-ordin.srv-jvt.com
```

> **PORT** é obrigatória no `.env`. A API **não** usa porta padrão embutida — só a definida em `PORT`.

Gerar segredos JWT:

```bash
openssl rand -base64 48
```

---

## 5. Dependências, build e Prisma

```bash
cd /var/www/api_agenda_ordin

npm install
npm run build
```

O `postinstall` executa `prisma generate` automaticamente.

Na **primeira inicialização**, o bootstrap da API executa:

- conexão com PostgreSQL;
- criação do banco (se não existir);
- `prisma db push` (sincroniza schema);
- validação das tabelas.

Não é necessário rodar `prisma migrate` manualmente em banco vazio.

Opcional (somente se quiser rodar antes do PM2):

```bash
npx prisma db push
```

---

## 6. PM2

```bash
cd /var/www/api_agenda_ordin

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Siga a instrução exibida por `pm2 startup` (comando `sudo env ...`).

Comandos úteis:

```bash
pm2 status
pm2 logs api-ordin-flow
pm2 restart api-ordin-flow
```

Teste local na VPS:

```bash
curl http://127.0.0.1:3100/health
```

Resposta esperada: `{"status":"ok"}` (ou equivalente do endpoint `/health`).

---

## 7. Nginx (proxy reverso)

```bash
sudo nano /etc/nginx/sites-available/api-ordin
```

Conteúdo:

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

Ativar site:

```bash
sudo ln -sf /etc/nginx/sites-available/api-ordin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Cloudflare

No painel Cloudflare (DNS do domínio):

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | api-ordin | IP_DA_VPS | Proxied (nuvem laranja) |

**SSL/TLS** → modo **Full** ou **Full (strict)**.

Se usar **Full (strict)**, instale certificado na VPS (Let's Encrypt):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api-ordin.srv-jvt.com
```

Com proxy Cloudflare ativo, o Nginx pode permanecer em HTTP (porta 80) na origem; o Cloudflare termina HTTPS para o cliente.

**Recomendado no Cloudflare:**

- SSL/TLS: Full
- Always Use HTTPS: On
- WebSockets: Off (não necessário para esta API)

---

## 9. Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

A porta **3100** não precisa estar aberta externamente — só o Nginx (80/443) acessa a API.

---

## 10. Atualização (deploy de nova versão)

```bash
cd /var/www/api_agenda_ordin
git pull
npm install
npm run build
pm2 restart api-ordin-flow
```

---

## 11. Logs esperados na inicialização

```
✅ PostgreSQL acessível
✅ Banco conectado: ordin
✅ Prisma Client gerado
✅ Schema Prisma sincronizado
✅ Tabelas validadas
✅ API iniciada na porta 3100
```

---

## 12. Problemas comuns

| Erro | Causa provável | Solução |
|------|----------------|---------|
| `PORT não definida` | `.env` sem `PORT` | Adicione `PORT=3100` no `.env` |
| `password authentication failed` | Senha/usuário PG incorretos | Confira `DATABASE_USER` e `DATABASE_PASSWORD` |
| `connection refused` | PostgreSQL parado ou host errado | `sudo systemctl start postgresql` |
| `Porta 3100 já está em uso` | Outro processo na porta | `sudo lsof -i :3100` ou altere `PORT` |
| 502 Bad Gateway (Nginx) | API não rodando | `pm2 status` e `pm2 logs api-ordin-flow` |
| CORS bloqueado no app | `CORS_ORIGIN` restrito | Inclua origem do app mobile/web no `.env` |

---

## 13. Comandos resumidos (VPS limpa)

```bash
# Sistema
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential postgresql postgresql-contrib nginx
sudo npm install -g pm2

# PostgreSQL (ajuste a senha)
sudo -u postgres psql -c "CREATE USER ordin WITH PASSWORD 'SUA_SENHA';"
sudo -u postgres psql -c "CREATE DATABASE ordin OWNER ordin;"

# App
cd /var/www && git clone https://github.com/jvt13/api_agenda_ordin.git
cd api_agenda_ordin
cp .env.example .env && nano .env
npm install && npm run build
pm2 start ecosystem.config.js && pm2 save && pm2 startup

# Nginx + teste
# (configure /etc/nginx/sites-available/api-ordin conforme seção 7)
curl http://127.0.0.1:3100/health
```

---

## 14. Whisper STT

> Guia completo (obrigatório para voz): **[DEPLOY.md](./DEPLOY.md)** — seções 5 e 12.

O backend usa serviço local de transcrição (`STT_SERVICE_URL`, padrão `http://localhost:8001`).

Suba ambos os processos com:

```bash
chmod +x services/stt/start.sh
pm2 start ecosystem.config.js
```

Verifique: `curl http://127.0.0.1:8001/health`
