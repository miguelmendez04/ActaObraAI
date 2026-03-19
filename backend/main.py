"""
ActaObra IA — Backend FastAPI
Sistema RAG para consulta de actas de obra (reuniones de ingeniería civil).
"""

import os
import uuid
import datetime
import random
import json
from typing import Optional

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()  # Carga las variables de entorno desde el archivo .env

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import chromadb
from chromadb.config import Settings as ChromaSettings

import fitz  # PyMuPDF
from PIL import Image
import io

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

CHROMA_DIR = os.environ.get("CHROMA_DIR", os.path.join(os.path.dirname(__file__), "..", "chroma_db"))
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

def extract_images_from_pdf(file_bytes: bytes) -> list[Image.Image]:
    """Extrae cada página de un PDF como una imagen PIL."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    images = []
    for page in doc:
        # Extraer página como imagen (pixmap) a menor DPI para acelerar el procesamiento
        pix = page.get_pixmap(dpi=100)
        img_bytes = pix.tobytes("jpeg")
        images.append(Image.open(io.BytesIO(img_bytes)))
    return images
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

    # 1. Extracción de imágenes
    images = extract_images_from_pdf(file_bytes)

    if not images:
        raise HTTPException(status_code=422, detail="No se pudo procesar el PDF.")

    # 2. Llamada a Gemini para estructurar el JSON desde las imágenes
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
    model = genai.GenerativeModel("gemini-2.5-flash")

    system_prompt = (
        "Eres un ingeniero civil senior con 20 años de experiencia analizando actas de reuniones "
        "y reportes de avance de obra presentados como imágenes de páginas de un PDF.\n\n"
        "INSTRUCCIONES PARA TEXTO:\n"
        "- Lee todo el texto mecanografiado, manuscrito y anotaciones visibles.\n"
        "- Extrae cada acuerdo, compromiso, observación técnica, pendiente y decisión como un string individual y detallado.\n"
        "- Incluye datos específicos: cantidades, medidas, especificaciones técnicas (f'c, diámetros, etc.), plazos y responsables mencionados.\n\n"
        "INSTRUCCIONES PARA IMÁGENES Y FOTOS (CRÍTICO):\n"
        "- Si la página contiene fotografías de la obra, planos, croquis o diagramas, DEBES analizarlos a fondo.\n"
        "- Para cada imagen de obra, describe detalladamente: qué elemento constructivo se muestra (cimentación, columnas, losas, muros, instalaciones, etc.), "
        "el estado visible de avance (porcentaje aproximado si es posible), los materiales visibles (concreto, acero, encofrado, block, etc.), "
        "cualquier problema visible (fisuras, desplomes, acumulación de agua, falta de limpieza, refuerzo expuesto, etc.), "
        "y las condiciones generales del sitio.\n"
        "- Si hay texto asociado a la imagen (pie de foto, título, anotación), vincúlalo con tu descripción visual.\n"
        "- Genera UN chunk de memoria POR CADA IMAGEN relevante, con el formato: "
        "'[EVIDENCIA FOTOGRÁFICA] Descripción detallada de lo observado en la imagen...'\n\n"
        "REGLA ESTRICTA: Ignora listas de participantes, firmas y cargos. Concéntrate en la sustancia técnica.\n\n"
        "Formato de salida JSON requerido:\n"
        "{\n"
        "  \"metadatos\": { \"proyecto\": \"Nombre del proyecto\", \"fecha\": \"Fecha del documento\" },\n"
        "  \"chunks_memoria\": [\n"
        "    \"Acuerdo o avance textual detallado...\",\n"
        "    \"[EVIDENCIA FOTOGRÁFICA] Descripción detallada de imagen de obra...\",\n"
        "    \"Otro acuerdo o pendiente...\"\n"
        "  ]\n"
        "}"
    )

    prompt_contents = [system_prompt] + images

    try:
        response = model.generate_content(
            prompt_contents,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        gemini_data = json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando con Gemini Multimodal: {str(e)}")

    metadatos_gemini = gemini_data.get("metadatos", {})
    chunks = gemini_data.get("chunks_memoria", [])

    if not chunks:
        raise HTTPException(status_code=422, detail="Gemini no devolvió fragmentos procesables.")

    # 3. Almacenar en ChromaDB con metadatos estructurados por IA
    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []

    for i, chunk in enumerate(chunks):
        doc_id = f"{file.filename}_{uuid.uuid4().hex[:8]}_{i}"
        meta = {
            "source": file.filename,
            "chunk_index": i,
            "proyecto": metadatos_gemini.get("proyecto", "Desconocido"),
            "fecha_reunion": metadatos_gemini.get("fecha", "N/A"),
            "tipo_reunion": "Acuerdo estructurado (IA)"
        }
        ids.append(doc_id)
        documents.append(chunk)
        metadatas.append(meta)

    collection.add(ids=ids, documents=documents, metadatas=metadatas)

    return IngestResponse(
        filename=file.filename,
        chunks_stored=len(chunks),
        message=f"Se ingresaron {len(chunks)} fragmentos estructurados con Gemini para '{file.filename}'.",
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

    # 2. Ensamblaje explícito del contexto (Context Assembly)
    context_parts: list[str] = []
    sources: list[dict] = []
    for doc, meta, dist in zip(documents, metadatas, distances):
        nombre_acta = meta.get("source", "desconocido")
        fecha = meta.get("fecha_reunion", "N/A")
        proyecto = meta.get("proyecto", "N/A")

        # Fragmento enriquecido con metadatos para el LLM
        fragmento_enriquecido = (
            "--- INICIO DE FRAGMENTO ---\n"
            f"Documento: {nombre_acta}\n"
            f"Fecha: {fecha}\n"
            f"Proyecto: {proyecto}\n"
            f"Contenido: {doc}\n"
            "--- FIN DE FRAGMENTO ---"
        )
        context_parts.append(fragmento_enriquecido)

        sources.append({
            "fragmento": doc[:200] + ("..." if len(doc) > 200 else ""),
            "archivo": nombre_acta,
            "fecha_reunion": fecha,
            "tipo_reunion": meta.get("tipo_reunion", "N/A"),
            "similitud": round(1 - dist, 4),
        })

    context = "\n\n".join(context_parts)

    # 3. Llamada a Gemini con System Prompt Blindado
    system_instruction = (
        "Eres el Residente de Obra principal del proyecto. Tu función es responder preguntas "
        "técnicas y de gestión basándote ÚNICA Y EXCLUSIVAMENTE en los fragmentos de actas de "
        "reunión proporcionados en el contexto.\n\n"
        "ESTILO DE RESPUESTA:\n"
        "- Adopta un tono profesional, técnico, directo y asertivo, típico de un ingeniero civil en campo.\n"
        "- Responde de forma DETALLADA y EXPLICATIVA. No des respuestas cortas ni telegráficas.\n"
        "- Cuando la información del contexto lo permita, elabora tu respuesta explicando: "
        "qué se acordó, por qué es relevante, qué implicaciones tiene para la obra, "
        "y si hay pendientes o responsables asociados.\n"
        "- Si el contexto contiene evidencia fotográfica o descripciones visuales de la obra, "
        "inclúyelas en tu respuesta explicando qué muestran las imágenes y cómo se relacionan "
        "con la pregunta del ingeniero.\n"
        "- Organiza la información de forma clara: usa viñetas, secciones o numeración cuando "
        "haya múltiples puntos que cubrir.\n\n"
        "REGLAS INQUEBRANTABLES:\n"
        "- Jamás inventes, asumas o deduzcas información que no esté escrita en el contexto.\n"
        "- Si la información solicitada no se encuentra en el contexto proporcionado, responde: "
        "'Como residente, informo que no tenemos registro de esto en el historial "
        "de actas consultado.' No ofrezcas suposiciones.\n"
        "- CITA OBLIGATORIA: Después de cada dato clave, DEBES citar el origen usando el formato: "
        "(Fuente: [Nombre del Acta] - [Fecha]). Tienes prohibido entregar un dato sin su cita.\n"
        "- Si varios fragmentos aportan información relevante, sintetízalos en una respuesta "
        "coherente y completa, citando cada fuente correspondiente."
    )

    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=system_instruction,
    )

    prompt_completo = f"[CONTEXTO]:\n{context}\n\n[PREGUNTA DEL INGENIERO]:\n{question}"

    try:
        response = model.generate_content(prompt_completo)
        answer = response.text
    except Exception as e:
        answer = f"❌ Error al generar respuesta con Gemini: {str(e)}"

    return AskResponse(answer=answer, sources=sources)
