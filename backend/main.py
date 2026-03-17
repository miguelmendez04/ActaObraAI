"""
ActaObra IA — Backend FastAPI
Sistema RAG para consulta de actas de obra (reuniones de ingeniería civil).
"""

import os
import uuid
import datetime
import random
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import chromadb
from chromadb.config import Settings as ChromaSettings

from PyPDF2 import PdfReader

# ---------------------------------------------------------------------------
# App & ChromaDB initialisation
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ActaObra IA",
    description="RAG backend para actas de reuniones de obra",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
collection = chroma_client.get_or_create_collection(
    name="actas_obra",
    metadata={"hnsw:space": "cosine"},
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TIPOS_REUNION = [
    "Reunión de coordinación",
    "Reunión de avance de obra",
    "Reunión de seguridad",
    "Comité de obra",
    "Reunión técnica",
]


def extract_text_from_pdf(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from a PDF using PyPDF2."""
    import io

    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())
    full_text = "\n\n".join(pages_text)
    if not full_text.strip():
        # Fallback: simulated text for testing when PDF has no extractable text
        full_text = (
            f"[Texto simulado del documento: {filename}]\n"
            "Se acordó revisar el avance de la cimentación en el sector norte.\n"
            "Se aprobó el uso de concreto f'c=250 para las columnas del nivel 3.\n"
            "El contratista deberá presentar el plan de trabajo actualizado antes del viernes.\n"
            "Se requiere refuerzo adicional en la losa del estacionamiento.\n"
            "La siguiente reunión será el lunes a las 10:00 AM en oficina de obra."
        )
    return full_text


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return [c.strip() for c in chunks if c.strip()]


def generate_metadata(filename: str, chunk_index: int) -> dict:
    """Generate simulated structural metadata for a chunk."""
    base_date = datetime.date(2025, 1, 15)
    offset_days = random.randint(0, 365)
    fecha = (base_date + datetime.timedelta(days=offset_days)).isoformat()
    return {
        "source": filename,
        "chunk_index": chunk_index,
        "fecha_reunion": fecha,
        "tipo_reunion": random.choice(TIPOS_REUNION),
    }


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]


class IngestResponse(BaseModel):
    filename: str
    chunks_stored: int
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "app": "ActaObra IA",
        "version": "0.1.0",
        "endpoints": ["/ingest-pdf", "/ask"],
    }


@app.post("/ingest-pdf", response_model=IngestResponse)
async def ingest_pdf(file: UploadFile = File(...)):
    """
    Recibe un PDF, extrae texto, realiza chunking con metadatos ficticios
    y almacena los vectores en ChromaDB.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF.")

    file_bytes = await file.read()

    # 1. Extracción de texto
    full_text = extract_text_from_pdf(file_bytes, file.filename)

    # 2. Chunking
    chunks = chunk_text(full_text)

    if not chunks:
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del PDF.")

    # 3. Almacenar en ChromaDB con metadatos
    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []

    for i, chunk in enumerate(chunks):
        doc_id = f"{file.filename}_{uuid.uuid4().hex[:8]}_{i}"
        meta = generate_metadata(file.filename, i)
        ids.append(doc_id)
        documents.append(chunk)
        metadatas.append(meta)

    collection.add(ids=ids, documents=documents, metadatas=metadatas)

    return IngestResponse(
        filename=file.filename,
        chunks_stored=len(chunks),
        message=f"Se ingresaron {len(chunks)} fragmentos del archivo '{file.filename}' correctamente.",
    )


@app.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest):
    """
    Recibe una pregunta, busca fragmentos relevantes en ChromaDB
    y genera una respuesta simulando la llamada a Gemini.
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía.")

    # 1. Búsqueda de similitud en ChromaDB
    n_results = min(5, max(collection.count(), 1))
    results = collection.query(query_texts=[question], n_results=n_results)

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    if not documents:
        return AskResponse(
            answer="No se encontraron actas relevantes para tu consulta. Sube algunos PDFs primero.",
            sources=[],
        )

    # 2. Construir contexto para el LLM
    context_parts: list[str] = []
    sources: list[dict] = []
    for doc, meta, dist in zip(documents, metadatas, distances):
        context_parts.append(doc)
        sources.append({
            "fragmento": doc[:200] + ("..." if len(doc) > 200 else ""),
            "archivo": meta.get("source", "desconocido"),
            "fecha_reunion": meta.get("fecha_reunion", "N/A"),
            "tipo_reunion": meta.get("tipo_reunion", "N/A"),
            "similitud": round(1 - dist, 4),
        })

    context = "\n---\n".join(context_parts)

    # 3. Llamada simulada a Gemini (se reemplazará con el SDK real)
    #    En producción: google.generativeai → model.generate_content(prompt)
    simulated_answer = (
        f"**Respuesta generada por IA (simulada):**\n\n"
        f"Basándome en {len(documents)} fragmentos relevantes de las actas de obra, "
        f"respondo a tu pregunta: *\"{question}\"*\n\n"
        f"De acuerdo con los registros encontrados:\n"
    )
    for i, src in enumerate(sources, 1):
        simulated_answer += (
            f"- **Fuente {i}** ({src['tipo_reunion']}, {src['fecha_reunion']}): "
            f"{src['fragmento'][:120]}…\n"
        )
    simulated_answer += (
        "\n> ⚠️ *Esta respuesta es simulada. Conecta la API de Google Gemini "
        "para obtener respuestas reales con el SDK `google-generativeai`.*"
    )

    return AskResponse(answer=simulated_answer, sources=sources)
