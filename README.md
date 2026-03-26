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
| Frontend | React · Vite · Tailwind CSS · React Markdown |
| Despliegue | Docker Multi-Stage (Hugging Face Spaces) |

## Arquitectura RAG

```
┌─────────────────────────────────┐      ┌──────────────────────────────────┐
│  React UI (Vite + Tailwind)     │─────▶│  FastAPI Backend                 │
│  (Chat & View Auto-Refresh 10s) │◀─────│  Servido estáticamente en '/'    │
└─────────────────────────────────┘      │                                  │
                                         │  ▶ Ingresos Manuales             │
┌─────────────────────────────────┐      │  POST /api/ingest-pdf            │
│  n8n Automation Workflows       │──────┼▶ POST /api/n8n/ingest-pdf        │
│  (Google Drive → n8n → API)     │──────┼▶ POST /api/n8n/ingest (Audios)   │
└─────────────────────────────────┘      │    (Clasificados por company_id) │
                                         │                                  │
                                         │  ▶ Consultas RAG                 │
                                         │  POST /api/ask                   │
                                         │    1. Pregunta → ChromaDB        │
                                         │    2. Contexto + meta → Gemini   │
                                         │    3. Respuesta citada → Cliente │
                                         └──────────────────────────────────┘
```

## Estructura del Proyecto

```
ActaObraIA/
├── backend/
│   └── main.py          # API FastAPI con endpoints /api/ingest-pdf, /api/ask, /api/documents
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Componente principal de React con la UI del Chat
│   │   ├── main.jsx     # Punto de entrada de React
│   │   └── index.css    # Estilos globales y Tailwind
│   ├── index.html       # Plantilla SPA
│   ├── package.json     # Dependencias de Node
│   ├── tailwind.config.js # Configuración de diseño y colores
│   └── vite.config.js   # Config de empaquetado
├── chroma_data/         # Base vectorial persistente de Chroma (se crea auto)
├── Dockerfile           # Multi-stage build (Node.js -> Python slim)
├── .env                 # API Key de Gemini
└── requirements.txt     # Dependencias del Backend
```

## Instalación y Desarrollo Local

### 1. Backend (FastAPI)

```bash
# Crear y activar entorno virtual (Windows)
python -m venv venv
.\venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar API Key de Gemini
echo GEMINI_API_KEY=tu_api_key_aqui > .env

# Levantar el servidor
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
- API Docs: `http://localhost:8000/docs`

### 2. Frontend (React + Vite)

Abre otra terminal:

```bash
cd frontend
npm install
npm run dev
```
- Interfaz en vivo: `http://localhost:5173`

*(Nota: En modo desarrollo (`npm run dev`), el frontend redirigirá automáticamente las peticiones de la API hacia el puerto `8000` del backend).*

## Producción (Docker puro)

La aplicación usa un Dockerfile multi-etapa optimizado para correr en Hugging Face Spaces (exponiendo solamente el puerto 7860 y ejecutando internamente el build de React y luego sirviendo todo vía FastAPI).

```bash
docker build -t actaobra-ia .
docker run -p 7860:7860 -e GEMINI_API_KEY=tu_key actaobra-ia
```
Abre tu navegador en `http://localhost:7860`.

## Características Principales

### 📄 Ingesta Automatizada y Manual (Multi-Empresa)
- **Automatización con n8n**: Los documentos (Audios de reuniones procesados o PDFs de actas) se suben directamente a Google Drive y un workflow de n8n los envía automáticamente a los endpoints `/api/n8n/ingest` y `/api/n8n/ingest-pdf`.
- **Segmentación por Cliente**: Soporte integrado para múltiples empresas (`company_id`) a través de colecciones independientes de ChromaDB para aislar completamente la información de cada cliente.
- **Carga Manual en UI**: Arrastra y suelta múltiples PDFs en la interfaz; se procesarán sistemáticamente.
- Cada PDF se convierte en imágenes (PyMuPDF) y es leído nativamente por **Gemini 2.5 Flash** en modo visión para extraer tanto texto como estatus constructivo de las fotografías detectadas.

### 🤖 Base de Datos en Tiempo Real (Polling)
- Las actas se almacenan en tiempo real en la base de datos vectorial `ChromaDB` segmentada.
- El menú lateral consulta permanentemente el endpoint `GET /api/documents` mediante un sistema de **Polling automático cada 10 segundos**.
- **Notificaciones (Toasts)** alertan a los usuarios en pantalla cuando nuevos documentos son ingestados de forma asíncrona por n8n en el trasfondo, eliminando la necesidad de recargar la página.

### 🏢 Consultas RAG Nivel "Ingeniero Civil Residente"
- Las preguntas al chat buscan similitud semántica en los fragmentos mediante incrustaciones vectoriales.
- El Prompt del Sistema ("Residente Principal de Obra") está **blindado contra alucinaciones**, respondiendo solo con la base aportada.
- **Citas estandarizadas rigurosas**: Todo hito y acuerdo en la respuesta detalla explícitamente el origen de forma visible.

---
*Desarrollado para transformar la memoria técnica muerta en un asistente vivo de obra.*
 
