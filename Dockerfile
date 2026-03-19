# ============================================================
# Etapa 1: Build del Frontend (Node.js)
# ============================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copiar configuración e instalar dependencias primero (cache layer)
COPY frontend/package.json ./
RUN npm install

# Copiar el resto del código y compilar la aplicación React (Vite)
COPY frontend/ ./
RUN npm run build

# ============================================================
# Etapa 2: Imagen de Producción (Python FastAPI)
# ============================================================
FROM python:3.10-slim

# Variables de entorno para Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CHROMA_DIR=/app/chroma_data

WORKDIR /app

# Instalar dependencias del sistema necesarias (PyMuPDF, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Crear usuario no root (uid 1000) requerido por Hugging Face
RUN useradd -m -u 1000 appuser

# Crear directorio para ChromaDB y darle permisos completos (777)
RUN mkdir -p /app/chroma_data && chmod 777 /app/chroma_data

# Instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código del backend
COPY backend/ ./backend/

# Copiar el frontend compilado (dist) desde la Etapa 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ajustar permisos de la carpeta app para el usuario no root
RUN chown -R appuser:appuser /app

# Cambiar a usuario no root
USER appuser

# Exponer el puerto 7860 para Hugging Face Spaces
EXPOSE 7860

# Ejecutar el backend (que a su vez sirve el frontend estático SPA)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
