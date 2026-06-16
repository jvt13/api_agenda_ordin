import os
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "pt")

app = FastAPI(title="Ordin Whisper STT", version="1.0.0")

_model: WhisperModel | None = None


@app.on_event("startup")
async def startup() -> None:
    global _model
    print(f"[STT] Carregando modelo Whisper '{WHISPER_MODEL}'...")
    started = time.time()
    _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    elapsed = time.time() - started
    print(f"[STT] Modelo carregado em {elapsed:.1f}s")


@app.get("/health")
async def health() -> dict[str, str]:
    if _model is None:
        raise HTTPException(status_code=503, detail="Modelo ainda não carregado")
    return {
        "status": "ok",
        "model": WHISPER_MODEL,
        "language": WHISPER_LANGUAGE,
    }


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, object]:
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="Serviço STT indisponível — modelo não carregado",
        )

    started = time.time()
    content = await audio.read()
    size_bytes = len(content)
    mime_type = audio.content_type or "application/octet-stream"
    filename = audio.filename or "audio.m4a"

    suffix = Path(filename).suffix or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        language = None if WHISPER_LANGUAGE == "auto" else WHISPER_LANGUAGE
        segments, info = _model.transcribe(tmp_path, language=language, vad_filter=True)
        text = "".join(segment.text for segment in segments).strip()
        duration_ms = int((time.time() - started) * 1000)

        return {
            "text": text,
            "model": WHISPER_MODEL,
            "language": info.language or WHISPER_LANGUAGE,
            "rawText": text,
            "durationMs": duration_ms,
            "audioDurationSec": info.duration,
            "mimeType": mime_type,
            "sizeBytes": size_bytes,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha na transcrição: {exc}") from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)
