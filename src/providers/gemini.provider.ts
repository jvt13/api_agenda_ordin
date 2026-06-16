import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAppConfig } from '../config/runtime-config.js';
import { voiceLog } from '../utils/voice-logger.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { StructuredTaskAI } from './ai.types.js';
import { validateAndResolveGeminiModel } from './gemini.validate.js';

let genAI: GoogleGenerativeAI | null = null;
let activeModelId: string | null = null;

const STRUCTURE_PROMPT = `Você é um assistente organizador de tarefas.

Transforme a fala do usuário em JSON estruturado.

Extraia:
- title (string, obrigatório)
- description (string, opcional)
- priority (LOW | MEDIUM | HIGH | URGENT)
- category (MAINTENANCE | SECURITY | ADMINISTRATIVE | FINANCIAL | PERSONAL | OPERATIONAL | OTHER)
- dueDate (ISO 8601 datetime ou null)
- urgency (boolean, opcional)

Retorne SOMENTE JSON válido.
Nunca explique.`;

export async function initializeGeminiProvider(): Promise<string> {
  const config = getAppConfig();
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada');
  }

  const modelId = await validateAndResolveGeminiModel();
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  activeModelId = modelId;
  return modelId;
}

export async function reinitializeGeminiProvider(): Promise<string | null> {
  try {
    return await initializeGeminiProvider();
  } catch (error) {
    genAI = null;
    activeModelId = null;
    throw error;
  }
}

export function isGeminiInitialized(): boolean {
  return Boolean(genAI && activeModelId);
}

export function getActiveGeminiModel(): string {
  if (!activeModelId || !genAI) {
    throw new Error('Gemini não inicializado — chame initializeGeminiProvider() antes do servidor');
  }
  return activeModelId;
}

function getTextModel() {
  const modelId = getActiveGeminiModel();
  return genAI!.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });
}

function parseJsonResponse(raw: string): StructuredTaskAI {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return JSON.parse(cleaned) as StructuredTaskAI;
}

export function buildFallbackStructuredTask(text: string): StructuredTaskAI {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
  return {
    title: firstLine.slice(0, 100) || 'Tarefa por voz',
    description: trimmed.length > 100 ? trimmed : undefined,
    priority: 'MEDIUM',
    category: 'OTHER',
    dueDate: null,
    urgency: false,
  };
}

export type { StructuredTaskAI };

export interface StructureTaskResult {
  structured: StructuredTaskAI;
  rawResponse: string;
  geminiFailed: boolean;
  geminiError?: string;
}

export async function structureTaskFromText(text: string): Promise<StructureTaskResult> {
  const started = Date.now();
  const modelId = getActiveGeminiModel();

  voiceLog.gemini('Estruturando tarefa (somente texto)', {
    model: modelId,
    textLength: text.length,
    preview: text.slice(0, 120),
  });

  try {
    const model = getTextModel();
    const result = await model.generateContent([
      { text: STRUCTURE_PROMPT },
      { text },
    ]);

    const rawResponse = result.response.text();
    const structured = parseJsonResponse(rawResponse);

    if (!structured.title) {
      structured.title = text.slice(0, 100);
    }

    voiceLog.gemini('Estruturação concluída', {
      model: modelId,
      durationMs: Date.now() - started,
      title: structured.title,
    });

    return { structured, rawResponse, geminiFailed: false };
  } catch (error) {
    const message = (error as Error).message;
    voiceLog.error('GEMINI', 'Erro na estruturação', {
      model: modelId,
      durationMs: Date.now() - started,
      error: message,
    });
    throw new AppError(502, 'Falha ao estruturar tarefa com IA', 'AIStructureError');
  }
}

/** Estruturação com fallback local — preserva transcrição se Gemini falhar. */
export async function structureTaskFromTextWithFallback(text: string): Promise<StructureTaskResult> {
  try {
    return await structureTaskFromText(text);
  } catch (error) {
    const message = error instanceof AppError ? error.message : (error as Error).message;
    const structured = buildFallbackStructuredTask(text);

    voiceLog.error('GEMINI', 'Usando fallback estrutural — transcrição preservada', {
      model: getActiveGeminiModel(),
      error: message,
      fallbackTitle: structured.title,
    });

    return {
      structured,
      rawResponse: JSON.stringify({
        fallback: true,
        reason: message,
        transcription: text,
        structured,
      }),
      geminiFailed: true,
      geminiError: message,
    };
  }
}

export async function processTextWithAI(text: string) {
  const result = await structureTaskFromText(text);
  return { structured: result.structured, rawResponse: result.rawResponse };
}
