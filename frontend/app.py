"""
ActaObra IA — Frontend Streamlit
Dashboard MVP para ingesta de PDFs y consulta RAG.
"""

import streamlit as st
import requests

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

BACKEND_URL = "http://localhost:8000"

st.set_page_config(
    page_title="ActaObra IA",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Estilos personalizados
# ---------------------------------------------------------------------------

st.markdown(
    """
    <style>
    /* Sidebar */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    }
    [data-testid="stSidebar"] * {
        color: #e0e0e0 !important;
    }
    /* Header */
    .main-header {
        background: linear-gradient(135deg, #0f3460 0%, #533483 100%);
        padding: 1.5rem 2rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        color: white;
    }
    .main-header h1 { margin: 0; font-size: 2rem; }
    .main-header p  { margin: 0.3rem 0 0 0; opacity: 0.85; font-size: 1rem; }
    /* Chat bubbles */
    .stChatMessage { border-radius: 12px; }
    /* Upload success */
    .upload-success {
        background: #0d7a3e22;
        border-left: 4px solid #0d7a3e;
        padding: 0.8rem 1rem;
        border-radius: 6px;
        margin: 0.5rem 0;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Estado de sesión
# ---------------------------------------------------------------------------

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# ---------------------------------------------------------------------------
# Sidebar — Ingesta de PDFs
# ---------------------------------------------------------------------------

with st.sidebar:
    st.image(
        "https://img.icons8.com/fluency/96/construction.png",
        width=64,
    )
    st.title("📂 Ingesta de Actas")
    st.caption("Sube actas de reuniones en PDF para alimentar la base de conocimiento.")

    uploaded_files = st.file_uploader(
        "Arrastra o selecciona PDFs",
        type=["pdf"],
        accept_multiple_files=True,
        key="pdf_uploader",
    )

    if uploaded_files:
        if st.button("🚀 Procesar PDFs", use_container_width=True):
            for uf in uploaded_files:
                with st.spinner(f"Procesando *{uf.name}*…"):
                    try:
                        resp = requests.post(
                            f"{BACKEND_URL}/ingest-pdf",
                            files={"file": (uf.name, uf.getvalue(), "application/pdf")},
                            timeout=300,  # Aumentado para dar tiempo a Gemini Multimodal
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            st.success(
                                f"✅ **{data['filename']}** — "
                                f"{data['chunks_stored']} fragmentos almacenados."
                            )
                        else:
                            st.error(f"❌ Error ({resp.status_code}): {resp.text}")
                    except requests.exceptions.ConnectionError:
                        st.error(
                            "⚠️ No se pudo conectar al backend. "
                            "Asegúrate de que el servidor FastAPI esté corriendo en "
                            f"`{BACKEND_URL}`."
                        )

    st.divider()
    st.markdown(
        "**Stack:** FastAPI · ChromaDB · Gemini · Streamlit\n\n"
        "Desarrollado como MVP de ActaObra IA 🏗️"
    )

# ---------------------------------------------------------------------------
# Área principal — Chat RAG
# ---------------------------------------------------------------------------

st.markdown(
    '<div class="main-header">'
    "<h1>🏗️ ActaObra IA</h1>"
    "<p>Consulta inteligente sobre acuerdos históricos de reuniones de obra</p>"
    "</div>",
    unsafe_allow_html=True,
)

# Mostrar historial de chat
for msg in st.session_state.chat_history:
    with st.chat_message(msg["role"], avatar="🧑‍💼" if msg["role"] == "user" else "🤖"):
        st.markdown(msg["content"])

# Input de chat
if prompt := st.chat_input("Escribe tu consulta, ej: ¿Qué se acordó sobre el concreto?"):
    # Mostrar mensaje del usuario
    st.session_state.chat_history.append({"role": "user", "content": prompt})
    with st.chat_message("user", avatar="🧑‍💼"):
        st.markdown(prompt)

    # Llamar al backend
    with st.chat_message("assistant", avatar="🤖"):
        with st.spinner("Buscando en las actas…"):
            try:
                resp = requests.post(
                    f"{BACKEND_URL}/ask",
                    json={"question": prompt},
                    timeout=30,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    answer = data["answer"]
                    sources = data.get("sources", [])

                    st.markdown(answer)

                    # Mostrar fuentes en un expander
                    if sources:
                        with st.expander("📎 Ver fuentes consultadas", expanded=False):
                            for i, src in enumerate(sources, 1):
                                st.markdown(
                                    f"**Fuente {i}:** {src.get('archivo', '?')} — "
                                    f"*{src.get('tipo_reunion', '')}* "
                                    f"({src.get('fecha_reunion', '')}) — "
                                    f"Similitud: `{src.get('similitud', 'N/A')}`"
                                )
                                st.caption(src.get("fragmento", ""))
                                st.divider()
                else:
                    answer = f"❌ Error del backend ({resp.status_code}): {resp.text}"
                    st.error(answer)

            except requests.exceptions.ConnectionError:
                answer = (
                    "⚠️ No se pudo conectar al backend. "
                    f"Asegúrate de que FastAPI esté corriendo en `{BACKEND_URL}`."
                )
                st.warning(answer)

    st.session_state.chat_history.append({"role": "assistant", "content": answer})
