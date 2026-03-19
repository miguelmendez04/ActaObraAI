import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! Soy el asistente de ActaObra IA. Estoy listo para consultar la memoria operativa del proyecto. ¿Qué necesitas saber sobre los acuerdos o resoluciones técnicas?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll al enviar mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Obtener la URL de la API según el entorno
  const getApiUrl = (endpoint) => {
    return window.location.hostname === 'localhost' && window.location.port === '5173'
      ? `http://localhost:8000/api/${endpoint}`
      : `/api/${endpoint}`;
  };

  // Cargar documentos al inicio
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch(getApiUrl('documents'));
        if (response.ok) {
          const data = await response.json();
          setDocuments(data.documents || []);
        }
      } catch (error) {
        console.error("Error cargando documentos:", error);
      }
    };
    fetchDocuments();
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.content }),
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error al consultar la IA:", error);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ Error al conectar con el servidor: ${error.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Mensaje inicial de archivo iterado
        setMessages((prev) => [
          ...prev, 
          {
            role: 'assistant',
            content: `⏳ Procesando el PDF '**${file.name}**'... [${i + 1} de ${files.length}]`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

        const response = await fetch(getApiUrl('ingest-pdf'), {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Error al subir: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Mensaje de exito por archivo
        setMessages((prev) => [
          ...prev, 
          {
            role: 'assistant',
            content: `✅ **¡PDF Procesado!** (${i + 1}/${files.length})\nSe extrajeron **${data.chunks_stored}** fragmentos estructurados de *'${data.filename}'*.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

      } catch (error) {
        console.error("Error subiendo el archivo:", error);
        setMessages((prev) => [
          ...prev, 
          {
            role: 'assistant',
            content: `❌ **Error al subir '${file.name}':** ${error.message}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }

    // Refrescar lista de documentos final
    try {
      const docsResp = await fetch(getApiUrl('documents'));
      if (docsResp.ok) {
        const docsData = await docsResp.json();
        setDocuments(docsData.documents || []);
      }
    } catch (e) {
      console.error(e);
    }

    setIsUploading(false);
    // Reset input para permitir subir los mismos archivos de nuevo si se desea
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="bg-surface overflow-hidden flex h-screen w-full font-body text-on-surface">
      
      {/* Input de archivo oculto */}
      <input 
        type="file" 
        multiple
        accept="application/pdf" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
      />

      {/* Sidebar (The Anchor) */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-slate-100 dark:bg-slate-950 p-4 gap-4 z-50">
        <div className="flex flex-col gap-1 mb-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-900 dark:text-blue-100 text-3xl" data-icon="architecture">architecture</span>
            <h1 className="font-headline font-black text-2xl text-blue-900 dark:text-blue-100 tracking-tight">ActaObra IA</h1>
          </div>
          <p className="font-body text-xs font-medium text-slate-500 uppercase tracking-widest ml-11">Technical Sophistication</p>
        </div>
        
        <button 
          onClick={handleUploadClick}
          disabled={isUploading}
          className={`primary-gradient text-on-primary py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-body font-semibold shadow-sm transition-all ${isUploading ? 'opacity-70 cursor-wait' : 'hover:brightness-110 active:scale-95'}`}>
          <span className="material-symbols-outlined text-xl" data-icon="upload_file">
            {isUploading ? 'hourglass_empty' : 'upload_file'}
          </span>
          <span className="text-sm">{isUploading ? 'Procesando PDF...' : 'Subir Nueva Acta (PDF)'}</span>
        </button>
        
        <nav className="flex-grow flex flex-col gap-1 mt-4">
          <div className="mt-2">
            <div className="font-label text-xs font-bold text-on-surface-variant/60 tracking-[0.05em] px-2 mb-2 uppercase flex items-center justify-between">
              <span>📚 Base de Conocimiento</span>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px]">{documents.length}</span>
            </div>
            
            {documents.length === 0 ? (
              <div className="px-3 py-4 text-xs text-on-surface-variant/60 text-center border border-dashed border-outline-variant/30 rounded-lg bg-surface-container-lowest">
                No hay actas procesadas aún.
              </div>
            ) : (
              <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1">
                {documents.map((doc, i) => (
                  <li key={i}>
                    <div className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 bg-surface-container-lowest border border-outline-variant/10 rounded-lg shadow-sm">
                      <span className="material-symbols-outlined text-primary text-base shrink-0" data-icon="picture_as_pdf">picture_as_pdf</span>
                      <div className="flex flex-col flex-grow overflow-hidden">
                        <span className="truncate text-slate-700 font-bold">{doc.name}</span>
                        {doc.fecha && doc.fecha !== 'N/A' && (
                          <span className="text-[10px] text-slate-400 capitalize">{doc.fecha}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>
        
        <div className="pt-4 mt-auto border-t border-slate-200 dark:border-slate-800">
          <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-700 font-bold text-xs rounded">
            <span className="material-symbols-outlined text-sm" data-icon="dns">dns</span>
            <span>ChromaDB Conectado</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="md:ml-64 flex flex-col h-screen w-full relative bg-surface">
        
        {/* TopAppBar */}
        <header className="flex justify-between items-center h-16 px-8 w-full bg-slate-50 dark:bg-slate-900 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-headline font-extrabold text-xl text-slate-900 dark:text-slate-50 tracking-tight">Consulta de Memoria Operativa</h2>
            <div className="hidden sm:block h-4 w-[1px] bg-outline-variant/30"></div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-label text-[0.6875rem] font-bold text-on-surface-variant tracking-widest uppercase">Sistema Activo</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95 duration-150">
              <span className="material-symbols-outlined" data-icon="help">help</span>
            </button>
          </div>
        </header>

        {/* Chat Feed Area */}
        <section className="flex-grow overflow-y-auto px-4 md:px-10 pt-10 pb-36 space-y-8 scroll-smooth">
          
          {messages.map((msg, idx) => (
            <React.Fragment key={idx}>
              {msg.role === 'user' ? (
                /* User Message */
                <div className="flex justify-end w-full">
                  <div className="max-w-[85%] md:max-w-[70%] flex flex-col items-end">
                    <div className="primary-gradient text-on-primary px-6 py-4 rounded-2xl rounded-tr-none shadow-sm">
                      <div className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-label text-[0.6875rem] font-bold text-on-surface-variant/50 tracking-widest uppercase">{msg.time}</span>
                      <span className="material-symbols-outlined text-[10px] text-blue-500" data-icon="done_all" style={{ fontVariationSettings: "'FILL' 1" }}>done_all</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* IA Message */
                <div className="flex justify-start w-full">
                  <div className="max-w-[95%] md:max-w-[85%] flex flex-col items-start gap-4">
                    <div className="surface-container-lowest glass-card border-outline-variant/15 border px-6 md:px-8 py-6 rounded-2xl rounded-tl-none shadow-[0_4px_20px_rgba(0,0,0,0.03)] w-full">
                      <div className="flex items-center gap-2 mb-4 text-primary">
                        <span className="material-symbols-outlined text-xl" data-icon="verified" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                        <span className="font-label text-[0.6875rem] font-bold tracking-[0.05em] uppercase">Análisis Técnico Verificado</span>
                      </div>
                      
                      <div className="font-body text-sm text-on-surface leading-relaxed mb-4">
                        <div className="prose prose-sm md:prose-base prose-blue max-w-none">
                          <ReactMarkdown>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                      
                      {/* Fuentes */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="bg-surface-container-low p-4 rounded-lg border-l-4 border-primary mt-4">
                          <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-primary mt-1" data-icon="info">info</span>
                            <div className="flex-grow">
                              <h4 className="font-headline font-bold text-xs text-primary mb-2">Fuentes Consultadas:</h4>
                              <div className="space-y-2">
                                {msg.sources.map((src, idxSrc) => (
                                  <div key={idxSrc} className="text-[13px] text-on-surface-variant">
                                    <span className="font-semibold text-primary">{src.archivo}</span> <span className="text-[11px] opacity-70">({src.fecha_reunion})</span>
                                    <p className="italic mt-1 border-l-2 border-outline-variant/30 pl-2">"{src.fragmento}"</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="font-label text-[0.6875rem] font-bold text-on-surface-variant/50 tracking-widest uppercase">{msg.time}</span>
                      <span className="font-label text-[0.6875rem] font-bold text-primary/70 tracking-widest uppercase">• ACTAOBRA ENGINE v2.1</span>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Estado de carga */}
          {isLoading && (
            <div className="flex justify-start w-full">
              <div className="max-w-[85%] flex flex-col items-start gap-2">
                <div className="surface-container-lowest glass-card border-outline-variant/15 border px-8 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3 text-primary">
                  <div className="animate-pulse w-2 h-2 bg-primary rounded-full"></div>
                  <div className="animate-pulse w-2 h-2 bg-primary rounded-full" style={{ animationDelay: '0.2s' }}></div>
                  <div className="animate-pulse w-2 h-2 bg-primary rounded-full" style={{ animationDelay: '0.4s' }}></div>
                  <span className="text-sm font-semibold ml-2">Analizando base de conocimiento...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={bottomRef} />
        </section>

        {/* Input Area (The Drafting Table) */}
        <div className="absolute bottom-0 left-0 w-full p-4 md:p-6 bg-gradient-to-t from-surface via-surface to-transparent z-20">
          <div className="max-w-4xl mx-auto relative group">
            <div className="bg-surface-container-lowest glass-card border border-outline-variant/30 rounded-2xl shadow-xl flex items-center p-2 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-fixed transition-all duration-300">
              <div className="pl-4 pr-2 text-slate-400">
                <span className="material-symbols-outlined" data-icon="search">search</span>
              </div>
              <input 
                className="flex-grow bg-transparent border-none focus:outline-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/40 font-body py-3 text-sm" 
                placeholder="Ej. ¿Quién quedó responsable del RFI de estructuras?..." 
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <div className="flex items-center gap-1 pr-2">
                <button className="hidden sm:block p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
                  <span className="material-symbols-outlined" data-icon="attach_file">attach_file</span>
                </button>
                <button 
                  onClick={handleSend}
                  disabled={isLoading || !inputValue.trim()}
                  className={`primary-gradient text-on-primary p-3 rounded-xl shadow-lg transition-all flex items-center justify-center
                    ${(isLoading || !inputValue.trim()) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                >
                  <span className="material-symbols-outlined" data-icon="send" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                </button>
              </div>
            </div>
            
            <div className="hidden sm:flex justify-center mt-3 gap-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-xs text-on-surface-variant/50" data-icon="history">history</span>
                <span className="text-[10px] font-label font-bold text-on-surface-variant/50 uppercase tracking-widest">Memoria Activa en ChromaDB</span>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
