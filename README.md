---
title: ActaObra IA
emoji: 🏗️
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
license: mit
---

# 🏗️ ActaObra IA

**Sistema RAG Multimodal (Retrieval-Augmented Generation)** para ingenieros civiles.  
Sube actas de reuniones de obra (PDFs con texto, fotos y planos) y realiza consultas en lenguaje natural sobre los acuerdos históricos. El sistema interpreta visualmente las imágenes de avance de obra gracias a **Google Gemini 2.5 Flash**.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python · FastAPI · Uvicorn |
| Base Vectorial | ChromaDB (local, persistente) |
| IA / LLM | Google Gemini 2.5 Flash (SDK `google-generativeai`) — Multimodal |
| Procesamiento de PDFs | PyMuPDF (fitz) · Pillow |
| Frontend | Streamlit |

## Arquitectura RAG

```
┌───────────────┐      ┌──────────────────────────────────┐
│  Streamlit UI │─────▶│  FastAPI Backend                  │
│  (Chat + PDF) │◀─────│                                   │
└───────────────┘      │  POST /ingest-pdf                 │
                       │    1. PDF → Imágenes (PyMuPDF)    │
                       │    2. Imágenes → Gemini Vision     │
                       │    3. JSON estructurado → ChromaDB │
                       │                                   │
                       │  POST /ask                        │
                       │    1. Pregunta → ChromaDB (search) │
                       │    2. Contexto + metadatos → Gemini│
                       │    3. Respuesta citada → Cliente   │
                       └──────────────────────────────────┘
```

## Estructura del Proyecto

```
ActaObraIA/
├── backend/
│   └── main.py          # API FastAPI con endpoints /ingest-pdf y /ask
├── frontend/
│   └── app.py           # Dashboard Streamlit (chat + sidebar PDF)
├── chroma_db/           # Base vectorial persistente (se crea automáticamente)
├── .env                 # API Key de Gemini (no se sube a GitHub)
├── requirements.txt     # Dependencias
└── README.md
```

## Instalación

```bash
# 1. Crear y activar entorno virtual
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Configurar API Key de Gemini
# Crear archivo .env en la raíz del proyecto:
echo GEMINI_API_KEY=tu_api_key_aqui > .env
```

## Levantar los Servidores

### Backend (FastAPI)

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- Backend: `http://localhost:8000`  
- Swagger UI: `http://localhost:8000/docs`

### Frontend (Streamlit)

En otra terminal:

```bash
streamlit run frontend/app.py --server.port 8501
```

- Dashboard: `http://localhost:8501`

## Características Principales

### 📄 Ingesta Multimodal de PDFs
- Cada página del PDF se convierte en imagen con **PyMuPDF**.
- Las imágenes se envían a **Gemini 2.5 Flash** en modo visión multimodal.
- Gemini lee texto mecanografiado, manuscrito, analiza fotos de obra (elementos constructivos, % de avance, materiales, problemas visibles) y extrae acuerdos técnicos.
- Los fragmentos se almacenan en **ChromaDB** con metadatos reales (proyecto, fecha) extraídos por la IA.

### 🤖 Consultas RAG con Citas Obligatorias
- Las preguntas se procesan buscando los fragmentos más similares en ChromaDB.
- El contexto se ensambla con metadatos explícitos (documento, fecha, proyecto) para cada fragmento.
- Gemini actúa como **Residente de Obra** con un System Prompt blindado:
  - Tono profesional de ingeniero civil en campo.
  - Respuestas detalladas y explicativas con viñetas y estructura.
  - Cero alucinaciones: si no está en las actas, lo dice.
  - **Cita obligatoria** con formato `(Fuente: [Acta] - [Fecha])`.

## Uso

1. **Subir PDFs**: Usa la barra lateral para arrastrar actas de obra en PDF.
2. **Consultar**: Escribe tu pregunta en el chat, por ejemplo:
   - *"¿Qué se acordó sobre el concreto y en qué nivel?"*
   - *"¿Qué evidencia fotográfica hay del avance de obra?"*
   - *"¿Cuáles son los pendientes más críticos y quién es responsable?"*
   - *"Resume los acuerdos de la última reunión técnica"*

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Info de la aplicación |
| `POST` | `/ingest-pdf` | Sube un PDF, lo analiza visualmente con Gemini y almacena los fragmentos en ChromaDB |
| `POST` | `/ask` | Envía una pregunta y obtiene una respuesta RAG citada con fuentes |
