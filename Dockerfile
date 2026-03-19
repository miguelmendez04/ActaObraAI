# ============================================================
# ActaObra IA — Dockerfile para Hugging Face Spaces
# ============================================================

# Imagen base ligera
FROM python:3.10-slim

# Variables de entorno
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CHROMA_DIR=/app/chroma_data

# Directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema necesarias para PyMuPDF
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Crear usuario no root (uid 1000) requerido por Hugging Face
RUN useradd -m -u 1000 appuser

# Crear directorios para datos persistentes y darle permisos
RUN mkdir -p /app/chroma_data && chmod 777 /app/chroma_data
RUN mkdir -p /home/appuser/.streamlit && chmod 777 /home/appuser/.streamlit

# Copiar requirements e instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo el código fuente
COPY . .

# Ajustar permisos para el usuario 1000
RUN chown -R appuser:appuser /app

# Dar permisos de ejecución al script de arranque
RUN chmod +x start.sh

# Cambiar a usuario no root
USER appuser

# Exponer el puerto 7860 (requisito de Hugging Face Spaces)
EXPOSE 7860

# Comando de arranque
CMD ["./start.sh"]
