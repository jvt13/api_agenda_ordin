type VoiceTag = 'VOICE' | 'STT' | 'WHISPER' | 'GEMINI' | 'TASK_PARSER';

const COLORS: Record<VoiceTag, string> = {
  VOICE: '\x1b[95m',
  STT: '\x1b[96m',
  WHISPER: '\x1b[94m',
  GEMINI: '\x1b[93m',
  TASK_PARSER: '\x1b[92m',
};

const RESET = '\x1b[0m';

function format(tag: VoiceTag, message: string, meta?: Record<string, unknown>) {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${COLORS[tag]}[${tag}]${RESET} ${message}${metaStr}`;
}

export const voiceLog = {
  voice: (message: string, meta?: Record<string, unknown>) => console.log(format('VOICE', message, meta)),
  stt: (message: string, meta?: Record<string, unknown>) => console.log(format('STT', message, meta)),
  whisper: (message: string, meta?: Record<string, unknown>) => console.log(format('WHISPER', message, meta)),
  gemini: (message: string, meta?: Record<string, unknown>) => console.log(format('GEMINI', message, meta)),
  taskParser: (message: string, meta?: Record<string, unknown>) => console.log(format('TASK_PARSER', message, meta)),
  error: (tag: VoiceTag, message: string, meta?: Record<string, unknown>) =>
    console.error(format(tag, message, meta)),
};
