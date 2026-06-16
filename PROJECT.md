# PROJECT.md — Ordin / Agenda Inteligente

## 1. Visão geral

Assistente operacional mobile para captura rápida de tarefas por **voz, texto e foto**, com organização automática via IA — a decisão arquitetural central é separar custo de inteligência: **Whisper roda localmente (Python) e transcreve áudio de graça, enquanto o Gemini recebe somente texto** para estruturar a tarefa (título, prioridade, categoria, data), nunca o áudio.

## 2. Fluxo de dados (ponta a ponta)

```text
┌─────────────┐   áudio/texto/foto   ┌──────────────────┐
│   MOBILE    │ ───────────────────► │     BACKEND      │
│ Expo / RN   │                      │  Fastify (3333)  │
│             │ ◄─────────────────── │                  │
└─────────────┘    tarefa (JSON)     └──────────────────┘
                                          │        ▲
                          áudio (m4a)     │        │ texto transcrito
                                          ▼        │
                                   ┌──────────────────┐
                                   │   STT (Python)   │
                                   │ FastAPI (8001)   │
                                   │ faster-whisper   │
                                   └──────────────────┘
                                          │
                          texto ──────────┘
                                          ▼
                                   ┌──────────────────┐
                                   │     GEMINI       │
                                   │  (somente texto) │
                                   │ tarefa estrutur. │
                                   └──────────────────┘
                                          │
                          JSON estruturado│
                                          ▼
                                   ┌──────────────────┐
                                   │   PostgreSQL     │
                                   │  (Prisma ORM)    │
                                   └──────────────────┘

Anexos (áudio original, imagens) → Cloudinary (storage.provider)
```

Resumo: **Mobile → Backend → STT (Python) → Gemini → PostgreSQL**. O áudio só vai ao Whisper; o Gemini recebe apenas o texto transcrito.

## 3. Estrutura de pastas

```text
ordin/
├── scripts/
│   ├── start.mjs                      # Orquestra tudo: Docker/Postgres + STT + backend + Expo
│   ├── start-remote.mjs               # Variante apontando o mobile para API remota
│   ├── install-all.mjs               # Instala deps de raiz, backend, mobile (e Python do STT)
│   └── lib/
│       ├── docker.mjs                 # Detecta Docker e sobe/valida o container Postgres
│       ├── kill-dev-ports.mjs         # Libera portas 3333/8001/8081 (npm run kill-ports)
│       ├── load-backend-env.mjs       # Carrega backend/.env e monta DATABASE_URL
│       ├── logger.mjs                 # Logger colorido por etapa ([DOCKER], [STT]...)
│       ├── network.mjs                # Descobre IP local da máquina (LAN)
│       ├── ports.mjs                  # findAvailablePort para o Expo
│       ├── resolve-mobile-api-url.mjs # Decide URL da API que o mobile usa
│       ├── run-dev-servers.mjs        # Sobe backend + Expo (+ STT) em paralelo
│       └── start-stt-service.mjs      # Instala deps Python e sobe o uvicorn do STT
│
├── services/stt/                      # Microserviço de transcrição (Whisper local)
│   ├── app.py                         # FastAPI: GET /health, POST /transcribe (porta 8001)
│   ├── whisper_service.py             # preload_model() + transcribe_bytes() (faster-whisper)
│   ├── text_cleanup.py                # Pós-processamento do texto transcrito
│   ├── requirements.txt
│   ├── Dockerfile
│   └── models/                        # Cache dos modelos Whisper (.gitkeep)
│
├── backend/                           # API Fastify + Prisma
│   ├── prisma/
│   │   ├── schema.prisma              # Modelo de dados (PostgreSQL)
│   │   └── seed.ts                    # Usuário demo (demo@agenda.com / 123456)
│   ├── src/
│   │   ├── index.ts                   # Entry: bootstrap do banco + start do servidor
│   │   ├── server.ts                  # Cria/configura a instância Fastify
│   │   ├── bootstrap/database/        # Conexão, sync do Prisma e validação de schema na subida
│   │   ├── config/
│   │   │   ├── env.ts                 # Validação das envs com Zod
│   │   │   ├── runtime-config.ts      # Config em runtime (env OU SystemSetting do banco)
│   │   │   ├── system-settings.registry.ts # Chaves configuráveis via Admin
│   │   │   └── database-url.ts / database.ts / paths.ts / load-env.ts
│   │   ├── middlewares/
│   │   │   ├── auth.ts                # Valida JWT, popula request.userId/userEmail
│   │   │   ├── admin.ts              # Exige role ADMIN
│   │   │   └── errorHandler.ts        # AppError + handler global
│   │   ├── modules/
│   │   │   ├── auth/                  # Registro, login, refresh, logout, /me
│   │   │   ├── tasks/                 # CRUD + criação por texto/voz/foto + draft/confirm
│   │   │   ├── voice/voice.pipeline.ts # Encadeia STT → Gemini (com fallback)
│   │   │   └── system/               # SystemSettings (Admin) + health
│   │   ├── providers/
│   │   │   ├── gemini.provider.ts     # Estruturação de texto via Gemini (+ fallback)
│   │   │   ├── gemini.validate.ts     # Resolve/valida o modelo Gemini disponível
│   │   │   ├── stt.provider.ts        # Cliente HTTP do serviço Whisper local
│   │   │   ├── storage.provider.ts    # Upload de áudio/imagem (Cloudinary)
│   │   │   └── ai.types.ts            # Tipos da resposta estruturada da IA
│   │   ├── routes/index.ts            # Registra /health, /auth, /tasks, /system
│   │   └── utils/                     # jwt, password, encryption, due-date, loggers...
│   ├── uploads/                       # Fallback local p/ áudio/imagens (audio/, images/)
│   └── package.json
│
├── mobile/                            # App React Native / Expo SDK 54
│   ├── App.tsx                        # Providers (Query, Navigation, SafeArea) + hydrate auth
│   ├── index.js                       # Entry do Expo
│   ├── src/
│   │   ├── navigation/index.tsx       # RootStack + AuthStack + Tabs (Captura/Tarefas/Admin)
│   │   ├── screens/                   # Home, Tasks, TaskDetail, Login, Register, Admin
│   │   ├── components/                # RecordingPulse (botão), TaskCard, ui/
│   │   ├── features/
│   │   │   ├── offline/queue.ts       # Base de fila offline (incompleta)
│   │   │   └── tasks/draft/utils.ts   # Manipulação do rascunho (merge voz/foto/texto)
│   │   ├── hooks/                     # useTasks, useSystem, useVoiceRecorder, useVoiceStageProgress
│   │   ├── services/                  # api (axios), auth.service, task.service, system.service
│   │   ├── store/index.ts             # Zustand: auth, capture, offline queue
│   │   ├── constants/index.ts         # API_URL + labels/cores de status/prioridade/categoria
│   │   ├── theme/ · types/ · utils/   # dueDate, format, image, location, media, storage
│   ├── .env.development / .env.production / .env.example
│   └── eas.json / app.json
│
├── docker-compose.yml                 # postgres:16-alpine + serviço STT (profile "stt")
├── package.json                       # Scripts raiz (start, install:all, kill-ports, db:*)
└── README.md
```

## 4. Módulos do backend

| Módulo | Rota principal | Service | Repository | O que faz |
|--------|----------------|---------|------------|-----------|
| **auth** | `auth.routes.ts` (`/auth`) | `auth.service.ts` | `auth.repository.ts` | Registro, login, refresh e logout com JWT (access + refresh token). Promove a ADMIN o e-mail em `ADMIN_BOOTSTRAP_EMAIL` (`ensureBootstrapAdmin`). |
| **tasks** | `task.routes.ts` (`/tasks`) | `task.service.ts` | `task.repository.ts` | CRUD de tarefas, dashboard, e criação por texto/voz/foto. Implementa o fluxo de rascunho (`buildDraftFromVoice`/`confirmDraft`), respeita flags `*EditedByUser` (`applyAIStructure`) e reestrutura via Gemini ao editar texto. |
| **voice** | — (sem rota; usado pelo tasks) | `voice.pipeline.ts` (`processVoicePipeline`) | — | Encadeia `transcribeAudioLocal` (STT) → `structureTaskFromTextWithFallback` (Gemini). Preserva a transcrição se o Gemini falhar (`geminiFailed`). |
| **system** | `system.routes.ts` (`/system`) | `system-settings.service.ts` + `system-health.service.ts` | `system-settings.repository.ts` | Painel Admin: lê/grava configurações sensíveis criptografadas no banco (Gemini/STT/Cloudinary), com auditoria; `GET /system/health` reporta status dos serviços. Protegido por `authMiddleware` + `adminMiddleware`. |

## 5. Modelo de dados (Prisma)

Datasource PostgreSQL. Enums: `TaskStatus` (PENDING, IN_PROGRESS, DONE, CANCELED), `TaskPriority` (LOW, MEDIUM, HIGH, URGENT), `TaskCategory` (MAINTENANCE, SECURITY, ADMINISTRATIVE, FINANCIAL, PERSONAL, OPERATIONAL, OTHER), `TaskActivityType` (CREATED, UPDATED, STATUS_CHANGED, AI_PROCESSED, ATTACHMENT_ADDED), `UserRole` (USER, ADMIN).

| Model | Campos-chave | Relacionamentos |
|-------|--------------|-----------------|
| **User** | `id`, `name`, `email` (unique), `passwordHash`, `role` (default USER) | `tasks[]`, `refreshTokens[]`, `systemSettingAudits[]` |
| **Task** | `title`, `description`, `transcription`, `aiRawResponse` (Json), `priority`, `category`, `status`, `dueDate`, `latitude`/`longitude`/`address`, `audioUrl`, `imageUrl` | `user`, `activities[]` |
| **TaskActivity** | `type` (TaskActivityType), `message`, `metadata` (Json) | `task` (onDelete: Cascade) |
| **RefreshToken** | `token` (unique), `expiresAt` | `user` (onDelete: Cascade) |
| **SystemSetting** | `key` (unique), `valueEncrypted`, `isSecret` | — |
| **SystemSettingAudit** | `settingKey`, `action`, `userId`, `userEmail` | `user` (onDelete: Cascade) |

**Campos especiais:**

- **Flags `*EditedByUser` em `Task`** — `priorityEditedByUser`, `dueDateEditedByUser`, `categoryEditedByUser` (default `false`). Quando o usuário edita manualmente um desses campos, a IA deixa de sobrescrevê-lo em reestruturações futuras (lógica em `applyAIStructure`, `task.service.ts:76`).
- **`aiRawResponse` (Json)** — guarda a resposta da IA e metadados. Dentro dele aparecem (não são colunas):
  - **`processingStatus`** — `'complete'` ou `'partial'` (Whisper OK mas Gemini falhou).
  - **`geminiFailed` / `geminiError`** — indicam fallback estrutural.
  - **`retryable`** — `true` quando a estruturação parcial pode ser refeita.
  - `stt`, `gemini`, `attachments[]`, `attachedPhotos[]`, `reprocessedOnUpdate`.

## 6. Fluxos críticos

### Captura por voz (draft → confirm) — fluxo padrão do app
1. Usuário segura o botão de microfone na `HomeScreen` → `useVoiceRecorder.startRecording()`.
2. Ao soltar, `handleVoiceComplete` chama `stopRecording()` e obtém localização (`getCurrentLocation`).
3. `useCreateVoiceDraft` → `POST /tasks/voice/draft`: backend faz upload do áudio (`uploadBuffer`) e roda **apenas STT** (`transcribeAudioLocal`) — **Gemini ainda não roda** (`buildDraftFromVoice`).
4. O texto transcrito vira um rascunho no modal "Revise antes de salvar"; o usuário pode editar texto, anexar foto/áudio e definir data limite.
5. Ao clicar **Salvar tarefa** → `useConfirmDraftTask` → `POST /tasks/confirm` (`confirmDraft`): **só agora** o Gemini estrutura o texto final (`structureTaskFromTextWithFallback`), resolve `dueDate` (usuário tem prioridade sobre a IA) e persiste a Task + `TaskActivity` (CREATED, AI_PROCESSED, ATTACHMENT_ADDED).
6. Se o Gemini falhar, a tarefa é salva mesmo assim com `processingStatus: 'partial'` e `retryable: true`.

### Captura por texto
1. Usuário toca "✏️ Digitar tarefa", escreve e adiciona ao rascunho (`handleTextSubmit`) — o texto entra na mesma transcrição do rascunho unificado.
2. Ao Salvar, segue pelo mesmo `POST /tasks/confirm` (Gemini estrutura no confirmar).
   - Alternativa direta (sem rascunho): `POST /tasks/text` → `createFromText` estrutura via `processTextWithAI` e salva imediatamente.

### Captura por foto
1. `handleCamera`/`handleGallery` capturam a imagem; `compressImage` reduz e anexa **localmente** ao rascunho (`attachLocalPhotoToDraft`) — imagem é tratada como **anexo**, não é interpretada pela IA.
2. No confirmar, a imagem é enviada (`POST /tasks/attachments/image` → `uploadImageAttachment`) e referenciada na Task; o texto (se houver) é o que o Gemini interpreta.
   - Alternativa direta: `POST /tasks/photo` → `createFromPhoto` (estrutura via IA somente se vier `text`).

## 7. Stack tecnológica

| Camada | Tecnologia | Versão | Observação |
|--------|------------|--------|------------|
| Mobile | React Native | 0.81.5 | Via Expo |
| Mobile | Expo SDK | ~54.0.0 | Expo Go (dev) + EAS Build (APK) |
| Mobile | React | 19.1.0 | |
| Mobile | NativeWind / TailwindCSS | ^4.1.23 / ^3.4.17 | Estilização |
| Mobile | Zustand | ^5.0.5 | Estado (auth, capture, offline) |
| Mobile | TanStack Query | ^5.77.2 | Cache/fetch de tarefas |
| Mobile | Axios | ^1.9.0 | Cliente HTTP + interceptor de refresh |
| Mobile | expo-av / expo-image-picker / expo-location | 16.x / 17.x / 19.x | Gravação, fotos, geolocalização |
| Backend | Fastify | ^5.3.3 | API HTTP (porta 3333) |
| Backend | Prisma + @prisma/client | ^6.8.2 | ORM PostgreSQL |
| Backend | Zod | ^3.25.28 | Validação de DTOs e env |
| Backend | @google/generative-ai | ^0.24.0 | Gemini (somente texto) |
| Backend | Cloudinary | ^2.6.0 | Storage de áudio/imagem |
| Backend | jsonwebtoken / bcryptjs | ^9.0.2 / ^3.0.2 | Auth |
| Backend | TypeScript / tsx / Vitest | ^5.8.3 / ^4.19.4 / ^3.1.4 | Build, dev e testes |
| STT | Python | 3.10+ | `python`, `python3` ou `py` no PATH |
| STT | FastAPI + faster-whisper | — (requirements.txt) | Transcrição local (porta 8001) |
| Banco | PostgreSQL | 16-alpine | Via Docker ou local |
| Runtime | Node.js | >=20 | Monorepo |

## 8. Variáveis de ambiente / Config runtime

Definidas em `backend/.env` e validadas por Zod em `backend/src/config/env.ts`.

**Obrigatórias:**
- `PORT` — porta do backend (ex.: 3333) — sem ela o boot falha.
- `DATABASE_URL` — string de conexão PostgreSQL.
- `JWT_SECRET` (≥32), `JWT_REFRESH_SECRET` (≥32) — segredos dos tokens.
- `SETTINGS_ENCRYPTION_KEY` (≥32) — criptografia das SystemSettings.

**Opcionais / com default:**
- `NODE_ENV` (default `development`), `CORS_ORIGIN` (default `*`).
- `DATABASE_HOST/PORT/USER/PASSWORD/NAME/SCHEMA` — partes da conexão (Postgres local).
- `JWT_EXPIRES_IN` (`15m`), `JWT_REFRESH_EXPIRES_IN` (`7d`).
- `ADMIN_BOOTSTRAP_EMAIL` — e-mail promovido a ADMIN automaticamente.
- `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-2.0-flash`).
- `STT_PROVIDER` (`local`), `STT_SERVICE_URL` (`http://localhost:8001`), `STT_TIMEOUT_MS` (`120000`).
- `WHISPER_MODEL` (`small`; enum tiny/base/small/medium/large-v2/large-v3), `WHISPER_LANGUAGE` (`pt`).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

**Mobile:** `EXPO_PUBLIC_API_URL` (em `mobile/.env.*`, gerado por `npm start`). Fallback: `http://10.0.2.2:3333` (dev) ou `https://api-ordin.srv-jvt.com` (release).

**Sobrescritas via SystemSetting no banco** (painel Admin, `system-settings.registry.ts`, têm prioridade sobre o `.env` em runtime via `applyRuntimeSettings`):
`GEMINI_API_KEY`, `GEMINI_MODEL`, `STT_PROVIDER`, `STT_SERVICE_URL`, `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. (Marcadas como secretas e criptografadas: `GEMINI_API_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.)

## 9. Endpoints da API

Base: `http://<host>:3333`. Auth via header `Authorization: Bearer <accessToken>`.

| Método | Rota | Descrição | Auth? |
|--------|------|-----------|-------|
| GET | `/health` | Status do servidor | Não |
| POST | `/auth/register` | Cria usuário e retorna tokens | Não |
| POST | `/auth/login` | Login, retorna tokens | Não |
| POST | `/auth/refresh` | Renova access token | Não (usa refresh token no body) |
| POST | `/auth/logout` | Invalida refresh token | Não |
| GET | `/auth/me` | Perfil do usuário logado | Sim |
| GET | `/tasks/dashboard` | Stats (hoje, atrasadas, urgentes, concluídas) | Sim |
| GET | `/tasks` | Lista paginada com filtros (status, priority, category, dueFrom/To, search, page, limit) | Sim |
| GET | `/tasks/:id` | Detalhe da tarefa + atividades | Sim |
| POST | `/tasks/text` | Cria tarefa por texto (IA estrutura na hora) | Sim |
| POST | `/tasks/text/draft` | Monta rascunho a partir de texto | Sim |
| POST | `/tasks/voice` | Cria tarefa por voz (STT + Gemini) | Sim |
| POST | `/tasks/voice/draft` | Rascunho de voz (somente STT) | Sim |
| POST | `/tasks/photo` | Cria tarefa com foto (+ texto opcional) | Sim |
| POST | `/tasks/attachments/image` | Upload de imagem, retorna URL | Sim |
| POST | `/tasks/confirm` | Confirma o rascunho (Gemini estrutura o texto final) | Sim |
| PATCH | `/tasks/:id` | Atualiza tarefa (reestrutura via IA se texto mudar) | Sim |
| DELETE | `/tasks/:id` | Exclui tarefa | Sim |
| GET | `/system/settings` | Lista configurações | Sim + ADMIN |
| PUT | `/system/settings` | Atualiza configurações (criptografadas) | Sim + ADMIN |
| GET | `/system/settings/audit` | Log de auditoria das mudanças | Sim + ADMIN |
| GET | `/system/health` | Saúde dos serviços (DB, STT, Gemini...) | Sim + ADMIN |

## 10. Estado do mobile

**Stores Zustand** (`src/store/index.ts`):
- `useAuthStore` — `user`, `isAuthenticated`, `isLoading`; ações `login`, `register`, `logout`, `hydrate`, `setUser`. `hydrate()` reidrata o usuário do storage seguro na inicialização (chamado no `App.tsx`).
- `useCaptureStore` — `isRecording`, `isProcessing`, `processingStage` (idle/uploading/transcribing/interpreting/drafting/saving) e `processingMessage` (via `STAGE_MESSAGES`).
- `useOfflineQueueStore` — `pendingItems`, `addPending`, `clearPending` (base preparada para fila offline, ainda não usada de fato).

**Queries TanStack** (`src/hooks/useTasks.ts`, chaves em `taskKeys`):
- Queries: `useDashboard` (staleTime 30s), `useTasks(filters)` (15s), `useTask(id)`.
- Mutations: `useCreateTextTask`, `useCreateVoiceTask`, `useCreateVoiceDraft`, `useCreatePhotoTask`, `useConfirmDraftTask` (`retry: false`), `useUpdateTask`, `useDeleteTask` — invalidam `taskKeys.all`/`detail` no sucesso.
- `QueryClient` global: `retry: 1`, `refetchOnWindowFocus: false` (`App.tsx`).

**Interceptor Axios** (`src/services/api.ts`):
- Request: injeta `Authorization: Bearer <accessToken>` do storage.
- Response: em `401`, faz refresh automático via `POST /auth/refresh`, enfileira requisições concorrentes (`refreshQueue`) e reexecuta; se o refresh falhar, limpa o storage de auth. `getErrorMessage`/`isSttError` mapeiam mensagens amigáveis.

**Navegação** (`src/navigation/index.tsx`):
- `RootStack`: `Auth` (quando não autenticado) ou `Main` + `TaskDetail` (modal).
- `AuthStack`: `Login`, `Register`.
- `Tab` (Main): `Home` (🎙️ Captura), `Tasks` (📋 Tarefas) e `Admin` (⚙️, somente se `user.role === 'ADMIN'`).

## 11. Pendências conhecidas

- **Fila offline incompleta** — `useOfflineQueueStore` (`mobile/src/store/index.ts`) e `mobile/src/features/offline/queue.ts` estão esboçados mas não integrados ao fluxo de captura (comentário "Preparado para fila offline futura").
- **Repos git aninhados** — existem `backend/.git` e `mobile/.git` dentro do repo raiz, sem serem submódulos declarados; pode causar confusão de versionamento.
- **`dist/` commitado/presente** — `backend/dist/` (build compilado) convive com `src/`; idealmente deveria ser ignorado/gerado.
- **Quase tudo untracked no git** — apenas `eas.json` está adicionado; falta um commit inicial estruturado com `.gitignore` cobrindo `node_modules`, `dist`, `.expo`, `uploads`.
- **Inconsistência de mensagens STT** — `stt.provider.ts` referencia processos `pm2`/`whisper-stt` e `ecosystem.config.js` que não existem no repo (provável setup de produção/VPS não versionado). TODO: confirmar se há infra PM2 separada.
- **Cache de `__pycache__`** — `services/stt/__pycache__/` está presente no diretório de trabalho.

## 12. Guia para o chat de IA (esta seção é para uso do Claude.ai)

**Sempre leia este arquivo antes de gerar qualquer prompt ou código.** Ele é a fonte de verdade sobre a arquitetura e os fluxos do Ordin.

Ao solicitar mudanças ou gerar instruções para o Claude Code, seja cirúrgico:
- **Referencie seção + arquivo + linha** sempre que possível (ex.: "seção 6 — `task.service.ts:157` (`confirmDraft`)").
- Indique exatamente qual arquivo editar e em qual função/linha.
- Prefira edições mínimas a reescritas completas.
- Se precisar criar arquivo novo, especifique o caminho exato.
- Liste os comandos de terminal necessários (se houver).
- Não repita código que não mudou.
- Respeite as decisões arquiteturais: **áudio só vai ao Whisper; Gemini só recebe texto**; a IA só estrutura no `confirm`; campos com flag `*EditedByUser` não são sobrescritos pela IA.
- Mantenha este `PROJECT.md` atualizado quando a estrutura, modelos, endpoints ou fluxos mudarem.

## 13. Melhorias planejadas

### ✅ Implementadas

- **Fila offline no mobile** — tasks salvas localmente via AsyncStorage quando sem internet,
  sync automático ao reconectar via NetInfo. Arquivos: mobile/src/features/offline/queue.ts,
  mobile/src/store/index.ts, mobile/src/hooks/useTasks.ts, mobile/src/hooks/useOfflineSync.ts.
- **Retry de tarefas partial** — botão "Reprocessar com IA" em TaskDetailScreen aparece
  quando retryable === true; backend limpa os campos partial/geminiFailed apos sucesso.
  Arquivos: mobile/src/screens/TaskDetailScreen.tsx, src/modules/tasks/task.service.ts.
- **Notificacoes de vencimento** — agenda notificacao 1 dia antes e no dia do vencimento
  via expo-notifications (requer dev build ou APK — nao funciona no Expo Go).
  Arquivos: mobile/src/utils/notifications.ts, mobile/App.tsx, mobile/src/hooks/useTasks.ts.
- **Localizacao no detalhe da tarefa** — ja estava implementado: botao "Abrir no mapa"
  em TaskDetailScreen.tsx abre Google Maps com latitude/longitude da tarefa.
- **Edicao de tarefas no mobile** — ja estava implementada: modal de edicao completo
  em TaskDetailScreen.tsx com texto, data, fotos e reprocessamento via Gemini.

### 🟡 Pendentes — medio impacto

- **Widget de captura rapida (Android)** — widget na tela inicial com botao de microfone
  abrindo direto na gravacao.
- **Filtros salvos** — salvar combinacoes de filtros na tela de Tarefas como atalhos
  (ex: "Urgentes de hoje").

### 🟢 Pendentes — baixo esforco, alto valor

- **Dashboard mais rico** — grafico de produtividade semanal aproveitando os dados ja
  retornados por GET /tasks/dashboard.
- **Exportar tarefas** — endpoint no backend para gerar PDF ou CSV das tarefas filtradas.
- **Modo escuro no mobile** — NativeWind ja suporta dark:, implementar o tema escuro
  nas telas principais.
