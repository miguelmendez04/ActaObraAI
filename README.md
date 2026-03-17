# 🏗️ ActaObra IA

**Sistema RAG (Retrieval-Augmented Generation)** para ingenieros civiles.  
Sube actas de reuniones de obra (PDFs) y realiza consultas en lenguaje natural sobre los acuerdos históricos.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python · FastAPI · Uvicorn |
| Base Vectorial | ChromaDB (local) |
| IA / LLM | Google Gemini (SDK `google-generativeai`) |
| Procesamiento | PyPDF2 · LangChain |
| Frontend | Streamlit |

## Estructura del Proyecto

```
ActaObraIA/
├── backend/
│   └── main.py          # API FastAPI (endpoints /ingest-pdf y /ask)
├── frontend/
│   └── app.py           # Dashboard Streamlit
├── chroma_db/           # Datos persistentes de ChromaDB (se crea automáticamente)
├── venv/                # Entorno virtual Python
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
```

## Levantar los Servidores

### Backend (FastAPI)

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El backend estará disponible en: `http://localhost:8000`  
Documentación interactiva (Swagger): `http://localhost:8000/docs`

### Frontend (Streamlit)

En otra terminal:

```bash
cd frontend
streamlit run app.py --server.port 8501
```

El dashboard estará disponible en: `http://localhost:8501`

## Uso

1. **Subir PDFs**: Usa la barra lateral del dashboard para arrastrar o seleccionar archivos PDF de actas de obra.
2. **Consultar**: Escribe tu pregunta en el chat, por ejemplo:
   - *"¿Qué se acordó sobre el concreto?"*
   - *"¿Cuáles fueron los acuerdos de la última reunión de seguridad?"*
   - *"¿Qué pendientes tiene el contratista?"*

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Info de la aplicación |
| `POST` | `/ingest-pdf` | Sube un PDF y almacena sus fragmentos en ChromaDB |
| `POST` | `/ask` | Envía una pregunta y obtiene una respuesta RAG |

---

> ⚠️ **Nota**: La respuesta del LLM es actualmente simulada. Para activar respuestas reales, configura tu API Key de Google Gemini y conecta el SDK `google-generativeai` en `backend/main.py`.
