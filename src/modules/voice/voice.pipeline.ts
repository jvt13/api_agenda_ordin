import {
  structureTaskFromTextWithFallback,
  type StructureTaskResult,
} from '../../providers/gemini.provider.js';
import { transcribeAudioLocal } from '../../providers/stt.provider.js';
import type { StructuredTaskAI } from '../../providers/ai.types.js';
import { voiceLog } from '../../utils/voice-logger.js';

export interface VoicePipelineResult {
  transcription: string;
  structured: StructuredTaskAI;
  rawResponse: string;
  geminiFailed: boolean;
  geminiError?: string;
  sttMetadata: {
    model: string;
    durationMs: number;
    mimeType?: string;
    sizeBytes?: number;
    audioDurationSec?: number;
    language?: string;
  };
}

function pipelineLog(message: string, meta?: Record<string, unknown>) {
  console.log(`\x1b[96m[VOICE_PIPELINE]\x1b[0m ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`);
}

export async function processVoicePipeline(
  audioBuffer: Buffer,
  filename: string,
): Promise<VoicePipelineResult> {
  const pipelineStarted = Date.now();

  pipelineLog('Iniciando pipeline de voz', { filename, sizeBytes: audioBuffer.length });
  voiceLog.voice('Iniciando pipeline de voz', { filename, sizeBytes: audioBuffer.length });

  const sttStarted = Date.now();
  const stt = await transcribeAudioLocal(audioBuffer, filename);

  pipelineLog('STT concluído', {
    model: stt.model,
    language: stt.language,
    durationMs: Date.now() - sttStarted,
    textLength: stt.text.length,
    preview: stt.text.slice(0, 120),
  });

  voiceLog.gemini('Enviando texto transcrito para interpretação contextual', {
    textLength: stt.text.length,
    preview: stt.text.slice(0, 120),
  });

  const geminiStarted = Date.now();
  let geminiResult: StructureTaskResult;

  try {
    geminiResult = await structureTaskFromTextWithFallback(stt.text);
  } catch (error) {
    pipelineLog('Gemini falhou sem fallback', {
      error: (error as Error).message,
      durationMs: Date.now() - geminiStarted,
    });
    throw error;
  }

  pipelineLog('Gemini concluído', {
    geminiFailed: geminiResult.geminiFailed,
    durationMs: Date.now() - geminiStarted,
    title: geminiResult.structured.title,
    totalMs: Date.now() - pipelineStarted,
  });

  if (geminiResult.geminiFailed) {
    voiceLog.error('GEMINI', 'Tarefa salva com estruturação parcial (fallback)', {
      error: geminiResult.geminiError,
      title: geminiResult.structured.title,
    });
  }

  voiceLog.taskParser('Tarefa estruturada a partir da transcrição', {
    title: geminiResult.structured.title,
    priority: geminiResult.structured.priority,
    category: geminiResult.structured.category,
    geminiFailed: geminiResult.geminiFailed,
  });

  return {
    transcription: stt.text,
    structured: geminiResult.structured,
    rawResponse: geminiResult.rawResponse,
    geminiFailed: geminiResult.geminiFailed,
    geminiError: geminiResult.geminiError,
    sttMetadata: {
      model: stt.model,
      durationMs: stt.durationMs,
      mimeType: stt.mimeType,
      sizeBytes: stt.sizeBytes,
      audioDurationSec: stt.audioDurationSec,
      language: stt.language,
    },
  };
}
