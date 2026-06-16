import { getAppConfig } from '../config/runtime-config.js';
import { voiceLog } from '../utils/voice-logger.js';

const MODELS_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Modelos estáveis para generateContent (ordem de fallback). */
export const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
] as const;

const DEPRECATED_ALIASES: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-2.0-flash',
  'gemini-1.5-flash-latest': 'gemini-2.0-flash',
  'gemini-1.5-flash-8b': 'gemini-2.0-flash-lite',
  'gemini-1.5-pro': 'gemini-2.5-flash',
  'gemini-1.5-pro-latest': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.0-flash',
};

export function resolveGeminiModelCandidates(configured: string): string[] {
  const normalized = configured.trim();
  const mapped = DEPRECATED_ALIASES[normalized] ?? normalized;
  const candidates = [mapped, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== mapped)];
  return [...new Set(candidates)];
}

interface ModelsListResponse {
  models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
}

function supportsGenerateContent(model: {
  supportedGenerationMethods?: string[];
}): boolean {
  return model.supportedGenerationMethods?.includes('generateContent') ?? false;
}

function modelIdFromName(name: string): string {
  return name.replace(/^models\//, '');
}

async function fetchAvailableModelIds(): Promise<Set<string>> {
  const config = getAppConfig();
  const url = `${MODELS_API}?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao listar modelos Gemini (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as ModelsListResponse;
  const ids = new Set<string>();

  for (const model of data.models ?? []) {
    if (!supportsGenerateContent(model)) continue;
    ids.add(modelIdFromName(model.name));
  }

  return ids;
}

async function probeGenerateContent(modelId: string): Promise<boolean> {
  const config = getAppConfig();
  const url = `${MODELS_API}/${modelId}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Responda apenas: ok' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });

  if (response.ok) return true;

  const body = await response.text();

  if (response.status === 404 || body.includes('not found') || body.includes('is not found')) {
    return false;
  }

  // Modelo existe, mas cota/rate limit — não bloqueia inicialização
  if (response.status === 429 || body.includes('quota') || body.includes('RESOURCE_EXHAUSTED')) {
    voiceLog.gemini('Modelo aceito (cota/rate limit no probe — ID válido)', { model: modelId });
    return true;
  }

  if (response.status === 403 && !body.includes('API key not valid')) {
    voiceLog.gemini('Modelo aceito (403 no probe — verifique permissões depois)', { model: modelId });
    return true;
  }

  if (response.status === 400 && body.includes('API key not valid')) {
    throw new Error('GEMINI_API_KEY inválida. Verifique a chave em backend/.env');
  }

  throw new Error(`Modelo "${modelId}" rejeitado (${response.status}): ${body.slice(0, 300)}`);
}

export async function validateAndResolveGeminiModel(): Promise<string> {
  const config = getAppConfig();
  const candidates = resolveGeminiModelCandidates(config.GEMINI_MODEL);
  voiceLog.gemini('Validando modelo Gemini na inicialização', {
    configured: config.GEMINI_MODEL,
    candidates,
  });

  let available: Set<string> | null = null;

  try {
    available = await fetchAvailableModelIds();
    voiceLog.gemini('Modelos com generateContent disponíveis na API', {
      count: available.size,
    });
  } catch (error) {
    voiceLog.gemini('Listagem de modelos indisponível — validando por probe', {
      reason: (error as Error).message,
    });
  }

  for (const modelId of candidates) {
    if (available && available.size > 0 && !available.has(modelId)) {
      voiceLog.gemini('Modelo ignorado (não listado na API)', { model: modelId });
      continue;
    }

    const ok = await probeGenerateContent(modelId);
    if (ok) {
      if (modelId !== config.GEMINI_MODEL) {
        voiceLog.gemini('Modelo configurado substituído por alternativa válida', {
          configured: config.GEMINI_MODEL,
          resolved: modelId,
        });
      } else {
        voiceLog.gemini('Modelo Gemini validado', { model: modelId });
      }
      return modelId;
    }

    voiceLog.gemini('Modelo indisponível (404)', { model: modelId });
  }

  throw new Error(
    `Nenhum modelo Gemini válido encontrado. Configurado: "${config.GEMINI_MODEL}". ` +
      `Tente GEMINI_MODEL=gemini-2.0-flash ou gemini-2.5-flash no painel de configurações`,
  );
}
