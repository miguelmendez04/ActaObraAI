#!/bin/bash

echo "🏗️ ActaObra IA — Iniciando servicios..."

# 1. Levantar FastAPI en segundo plano (background) en puerto 8000
echo "▶ Arrancando Backend (FastAPI) en puerto 8000..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# Esperar a que el backend esté listo
sleep 3

# 2. Levantar Streamlit en primer plano (foreground) en puerto 7860
echo "▶ Arrancando Frontend (Streamlit) en puerto 7860..."
streamlit run frontend/app.py \
    --server.port 7860 \
    --server.address 0.0.0.0 \
    --server.headless true \
    --browser.gatherUsageStats false
