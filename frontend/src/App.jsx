import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [companyId, setCompanyId] = useState(localStorage.getItem("company_id") || "");

  // ================= ESTADO DE NAVEGACIÓN Y VISTAS =================
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'database'
  
  // ================= ESTADO DE CHATS (HISTORIAL LOCAL) =================
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);

  // ================= ESTADO DE BASE DE DATOS =================
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLog, setUploadLog] = useState([]);
  
  // Inputs y UI
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null); // { message, type }
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevDocCountRef = useRef(0);

  // Cargar chats al iniciar sesión
  useEffect(() => {
    if (isAuthenticated && companyId) {
      const saved = localStorage.getItem(`actaobra_chats_${companyId}`);
      if (saved) {
        setChats(JSON.parse(saved));
      } else {
        setChats([]);
      }
      setCurrentChatId(null);
      setCurrentView('chat');
    }
  }, [isAuthenticated, companyId]);

  // Guardar chats en localStorage en cada cambio
  useEffect(() => {
    if (isAuthenticated && companyId) {
      localStorage.setItem(`actaobra_chats_${companyId}`, JSON.stringify(chats));
    }
  }, [chats, isAuthenticated, companyId]);

  // Auto-scroll en chat
  useEffect(() => {
    if (currentView === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chats, currentChatId, currentView, isLoading]);

  const getApiUrl = (endpoint) => {
    return window.location.hostname === 'localhost' && window.location.port === '5173'
      ? `http://localhost:8000/api/${endpoint}`
      : `/api/${endpoint}`;
  };

  // Toast helper
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("company_id");
    setIsAuthenticated(false);
    setDocuments([]);
    setCompanyId("");
    setChats([]);
    setCurrentChatId(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setIsLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(getApiUrl('login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      
      if (!res.ok) throw new Error("Credenciales inválidas. Verifica tu usuario de empresa.");
      
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("company_id", data.company_id);
      setCompanyId(data.company_id);
      setIsAuthenticated(true);
      setUsername("");
      setPassword("");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar documentos al inicio si esta autenticado
  const fetchDocuments = async () => {
    try {
      const response = await fetch(getApiUrl('documents'), {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.status === 401) return handleLogout();
      if (response.ok) {
        const data = await response.json();
        const newDocs = data.documents || [];
        
        // Detectar documentos nuevos
        if (prevDocCountRef.current > 0 && newDocs.length > prevDocCountRef.current) {
          const diff = newDocs.length - prevDocCountRef.current;
          showToast(`📄 ${diff} nuevo(s) documento(s) ingresado(s) a la base de datos`, 'success');
        }
        prevDocCountRef.current = newDocs.length;
        setDocuments(newDocs);
      }
    } catch (error) { console.error("Error cargando DB:", error); }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDocuments();
      // Polling cada 30 segundos
      const interval = setInterval(fetchDocuments, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleNewChat = () => {
    setCurrentChatId(null);
    setCurrentView('chat');
  };

  const selectChat = (id) => {
    setCurrentChatId(id);
    setCurrentView('chat');
  };

  const deleteChat = (e, id) => {
    e.stopPropagation(); // Evitar seleccionar el chat al borrar
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) setCurrentChatId(null);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userContent = inputValue;
    setInputValue('');
    setIsLoading(true);

    const userMessage = {
      role: 'user',
      content: userContent,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    let activeId = currentChatId;
    
    // Si no hay chat activo, creamos uno nuevo
    if (!activeId) {
      activeId = Date.now().toString();
      const newTitle = userContent.split(' ').slice(0, 4).join(' ') + '...';
      const newChat = {
        id: activeId,
        title: newTitle,
        date: new Date().toLocaleDateString(),
        messages: [
          {
            role: 'assistant',
            content: '¡Hola! Soy tu asistente virtual de ActaObra IA. Estoy listo para ayudarte a consultar los documentos y actas exclusivas de tu proyecto. ¿En qué te puedo ayudar?',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          },
          userMessage
        ]
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(activeId);
    } else {
      // Chat existente, agregar pregunta
      setChats(prev => prev.map(c => 
        c.id === activeId ? { ...c, messages: [...c.messages, userMessage] } : c
      ));
    }

    try {
      const response = await fetch(getApiUrl('ask'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ question: userContent }),
      });

      if (response.status === 401) {
        handleLogout();
        throw new Error("Sesión expirada.");
      }
      if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChats(prev => prev.map(c => 
        c.id === activeId ? { ...c, messages: [...c.messages, assistantMessage] } : c
      ));

    } catch (error) {
      console.error(error);
      const errMsg = {
        role: 'assistant',
        content: `❌ Error al interactuar con el servidor: ${error.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChats(prev => prev.map(c => 
        c.id === activeId ? { ...c, messages: [...c.messages, errMsg] } : c
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setCurrentView('database'); // Forzar vista BD para ver progreso
    setUploadLog([]);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        setUploadLog(prev => [{ status: 'loading', text: `⏳ Procesando: ${file.name} [${i + 1}/${files.length}]` }, ...prev]);
        
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(getApiUrl('ingest-pdf'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: formData,
        });

        if (response.status === 401) return handleLogout();
        if (!response.ok) throw new Error(`Status ${response.status}`);

        const data = await response.json();
        
        setUploadLog(prev => [{ 
          status: 'success', 
          text: `✅ Exitoso: '${file.name}' (${data.chunks_stored} fragmentos)` 
        }, ...prev.slice(1)]);
        successCount++;

      } catch (error) {
        setUploadLog(prev => [{ 
          status: 'error', 
          text: `❌ Fallo en '${file.name}': ${error.message}` 
        }, ...prev.slice(1)]);
      }
    }

    setUploadLog(prev => [{ 
      status: 'info', 
      text: `🏁 Proceso completado. ${successCount} de ${files.length} actas ingresadas.` 
    }, ...prev]);

    await fetchDocuments();
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  // ================= VISTA DE LOGIN =================
  if (!isAuthenticated) {
    return (
      <div className="bg-surface min-h-screen flex items-center justify-center font-body text-on-surface p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-[100px]"></div>
        </div>

        <div className="z-10 bg-surface-container-lowest glass-card border border-outline-variant/30 rounded-3xl p-8 md:p-12 shadow-2xl w-full max-w-md">
          <div className="flex flex-col items-center gap-3 mb-10">
            <div className="p-4 rounded-2xl primary-gradient text-on-primary shadow-lg mb-2">
              <span className="material-symbols-outlined text-4xl" data-icon="architecture">architecture</span>
            </div>
            <h1 className="font-headline font-black text-3xl text-center tracking-tight">ActaObra IA</h1>
            <p className="font-body text-sm font-medium text-on-surface-variant/70 text-center uppercase tracking-widest">Portal Empresarial</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="font-label text-xs font-bold text-on-surface-variant tracking-wider uppercase ml-1">Compañía / Usuario</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 group-focus-within:text-primary transition-colors" data-icon="corporate_fare">corporate_fare</span>
                <input 
                  type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
                  placeholder="ej. empresaA"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-label text-xs font-bold text-on-surface-variant tracking-wider uppercase ml-1">Clave de Acceso</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 group-focus-within:text-primary transition-colors" data-icon="key">key</span>
                <input 
                  type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>{loginError}
              </div>
            )}

            <button type="submit" disabled={isLoading} className={`mt-2 primary-gradient text-on-primary py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-body font-bold text-sm shadow-md transition-all ${isLoading ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5 active:scale-95'}`}>
              {isLoading ? <span className="material-symbols-outlined animate-spin cursor-wait">hourglass_empty</span> : <span className="material-symbols-outlined">login</span>}
              Ingresar a la Plataforma
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ================= VARIABLES CALCULADAS ACTIVAS =================
  const activeChat = chats.find(c => c.id === currentChatId);
  const currentMessages = activeChat ? activeChat.messages : [
    {
      role: 'assistant',
      content: '¡Hola y Bienvenido! Soy el asistente virtual para el análisis de reuniones y documentos de tu obra. ¿Qué proyecto, acuerdo o problema necesitas consultar hoy?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ];

  return (
    <div className="bg-surface flex h-screen w-full font-body text-on-surface overflow-hidden">
      
      {/* Oculto globalmente */}
      <input type="file" multiple accept="application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

      {/* ================= SIDEBAR (GESTOR DE CHATS) ================= */}
      <aside className="w-72 bg-slate-50 dark:bg-slate-950 border-r border-outline-variant/20 flex flex-col h-full shrink-0 z-40 transition-all shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Cabecera Sidebar */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary text-3xl" data-icon="architecture">architecture</span>
            <div className="flex flex-col">
              <h1 className="font-headline font-black text-xl tracking-tight leading-tight">ActaObra <span className="text-primary">IA</span></h1>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">{companyId}</span>
            </div>
          </div>

          <button 
            onClick={handleNewChat}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 hover:border-primary/50 text-on-surface py-3 px-4 rounded-xl flex items-center justify-between font-semibold shadow-sm transition-all hover:bg-primary/5 active:scale-[0.98] group">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" data-icon="add">add_circle</span>
              <span className="text-sm">Nueva Consulta</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant/30 group-hover:text-primary/70 text-sm" data-icon="edit">edit_square</span>
          </button>
        </div>

        {/* Historial de Chats */}
        <div className="flex-grow overflow-y-auto px-3 pb-4 custom-scrollbar">
          <div className="font-label text-[10px] font-bold text-on-surface-variant/60 tracking-widest uppercase px-3 mb-2 mt-2">
            Historial de Búsquedas
          </div>
          
          {chats.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-on-surface-variant/50 font-medium italic">
              Aún no has realizado cruces de información.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {chats.map(chat => (
                <li key={chat.id} className="relative group">
                  <button 
                    onClick={() => selectChat(chat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${currentChatId === chat.id && currentView === 'chat' ? 'bg-primary/10 text-primary font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-900 font-medium'}`}
                  >
                    <div className="flex flex-col truncate w-[85%]">
                      <span className="text-sm truncate">{chat.title}</span>
                      <span className="text-[10px] opacity-60">{chat.date}</span>
                    </div>
                  </button>
                  <button 
                    onClick={(e) => deleteChat(e, chat.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                    title="Borrar chat"
                  >
                    <span className="material-symbols-outlined text-[16px]" data-icon="delete">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Botonera Fija Inferior */}
        <div className="p-4 bg-slate-100 dark:bg-slate-900 border-t border-outline-variant/30 rounded-tr-3xl">
          <button 
            onClick={() => setCurrentView('database')}
            className={`w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl transition-all font-semibold text-sm ${currentView === 'database' ? 'primary-gradient text-on-primary shadow-md' : 'bg-surface-container-lowest text-on-surface hover:bg-slate-200 border border-outline-variant/30'}`}>
            <span className="material-symbols-outlined" data-icon="database">folder_special</span>
            <span>Tus Archivos</span>
          </button>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 font-bold text-xs rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]" data-icon="logout">logout</span>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ================= AREA PRINCIPAL ================= */}
      <main className="flex-grow flex flex-col h-full relative bg-surface-container-lowest w-[calc(100%-18rem)]">
        
        {/* === HEADER PRINCIPAL === */}
        <header className="h-16 px-8 bg-surface/80 backdrop-blur-md border-b border-outline-variant/20 flex items-center justify-between shrink-0 z-20 sticky top-0">
          <div className="flex items-center gap-3 text-slate-800 dark:text-slate-100">
            {currentView === 'chat' ? (
              <>
                <span className="material-symbols-outlined text-primary" data-icon="forum">forum</span>
                <span className="font-headline font-bold text-lg">{currentChatId ? activeChat?.title : 'Nueva Consulta'}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-emerald-500" data-icon="folder_open">folder_open</span>
                <span className="font-headline font-bold text-lg">Tus Documentos de Obra</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-label text-[10px] font-bold text-emerald-700 dark:text-emerald-400 tracking-widest uppercase">Sistema en línea</span>
          </div>
        </header>

        {/* === VISTA: CHAT ENGINE === */}
        {currentView === 'chat' && (
          <>
            <section className="flex-grow overflow-y-auto px-6 md:px-12 pt-8 pb-32 space-y-8 scroll-smooth custom-scrollbar">
              {currentMessages.map((msg, idx) => (
                <React.Fragment key={idx}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end w-full">
                      <div className="max-w-[85%] md:max-w-[70%] flex flex-col items-end">
                        <div className="primary-gradient text-on-primary px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-sm">
                          <div className="font-body text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="font-label text-[10px] font-bold text-on-surface-variant/40 tracking-widest uppercase">{msg.time}</span>
                          <span className="material-symbols-outlined text-[12px] text-blue-500" data-icon="done_all" style={{ fontVariationSettings: "'FILL' 1" }}>done_all</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start w-full">
                      <div className="max-w-[95%] md:max-w-[85%] flex flex-col items-start gap-2">
                        <div className="bg-surface glass-card border-outline-variant/20 border px-6 py-5 rounded-2xl rounded-tl-sm shadow-sm w-full">
                          <div className="flex items-center gap-2 mb-3 text-primary border-b border-primary/10 pb-3">
                            <span className="material-symbols-outlined text-lg bg-primary/10 p-1.5 rounded-full" data-icon="robot_2">robot_2</span>
                            <span className="font-label text-xs font-bold tracking-[0.05em] uppercase text-slate-800 dark:text-slate-200">Asistente Virtual</span>
                          </div>
                          
                          <div className="font-body text-[15px] text-on-surface leading-normal mb-1">
                            <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-headings:text-primary dark:prose-invert">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </div>
                          
                          {/* Fuentes */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mt-5">
                              <h4 className="font-headline font-bold text-xs text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">library_books</span> De dónde obtuve esta información:
                              </h4>
                              <div className="space-y-3">
                                {msg.sources.map((src, idxSrc) => (
                                  <div key={idxSrc} className="text-xs text-on-surface-variant">
                                    <span className="inline-block bg-primary/10 text-primary font-bold px-2 py-0.5 rounded text-[10px] mr-2 uppercase">{src.fecha_reunion}</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{src.archivo}</span>
                                    <p className="italic mt-1.5 border-l-2 border-slate-300 dark:border-slate-700 pl-3 text-slate-500 dark:text-slate-400">"{src.fragmento}"</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center ml-2">
                          <span className="font-label text-[10px] font-bold text-on-surface-variant/40 tracking-widest uppercase">{msg.time} • ACTAOBRA ENGINE</span>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}

              {isLoading && (
                <div className="flex justify-start w-full">
                  <div className="bg-surface border-outline-variant/15 border px-6 py-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3 text-primary">
                    <div className="animate-pulse w-2 h-2 bg-primary rounded-full"></div>
                    <div className="animate-pulse w-2 h-2 bg-primary rounded-full flex" style={{ animationDelay: '0.2s' }}></div>
                    <div className="animate-pulse w-2 h-2 bg-primary rounded-full flex" style={{ animationDelay: '0.4s' }}></div>
                    <span className="text-sm font-semibold ml-2">Buscando y leyendo tus documentos...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </section>

            {/* Input Floating Box */}
            <div className="absolute bottom-0 left-0 w-full p-4 md:p-8 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest to-transparent z-20">
              <div className="max-w-4xl mx-auto flex items-end gap-3 bg-surface border border-outline-variant/40 rounded-3xl p-2 shadow-[0_10px_40px_rgba(0,0,0,0.05)] focus-within:border-primary/50 focus-within:shadow-[0_10px_40px_rgba(66,133,244,0.1)] transition-all">
                <div className="p-3 text-slate-400">
                  <span className="material-symbols-outlined text-2xl" data-icon="search_insights">search_insights</span>
                </div>
                <textarea 
                  className="flex-grow bg-transparent border-none focus:outline-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 font-body py-3.5 text-sm resize-none max-h-32" 
                  placeholder="Escribe tu duda sobre resoluciones, fechas o problemas registrados en obra..." 
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <button 
                  onClick={handleSend}
                  disabled={isLoading || !inputValue.trim()}
                  className={`primary-gradient text-on-primary p-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center shrink-0 mb-0.5 mr-0.5
                    ${(isLoading || !inputValue.trim()) ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-1 active:scale-95'}`}
                >
                  <span className="material-symbols-outlined text-xl" data-icon="arrow_upward" style={{ fontVariationSettings: "'wght' 600" }}>arrow_upward</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* === VISTA: BASE DE DATOS E INGESTA === */}
        {currentView === 'database' && (
          <section className="flex-grow overflow-y-auto w-full bg-slate-50 dark:bg-slate-900 px-8 py-8 h-full custom-scrollbar relative">
            <div className="max-w-6xl mx-auto">
              
              {/* Bloque Superior: Subir Actas */}
              <div className="bg-surface border border-outline-variant/30 rounded-3xl p-8 mb-8 shadow-sm text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors pointer-events-none"></div>
                <div className="max-w-2xl mx-auto flex flex-col items-center">
                  <div className="p-4 bg-primary/10 text-primary rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-4xl" data-icon="file_upload">file_upload</span>
                  </div>
                  <h3 className="font-headline font-black text-2xl mb-2 text-slate-800 dark:text-slate-100">Sube tus Actas de Obra</h3>
                  <p className="font-body text-slate-500 mb-6 text-sm">Selecciona o arrastra tus actas de avance, RFI o reportes aquí. El sistema leerá todo el contenido de forma automática para que puedas hacerle preguntas luego.</p>
                  <button 
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className={`primary-gradient text-on-primary py-3 px-8 rounded-full shadow-lg font-bold flex items-center gap-3 transition-all ${isUploading ? 'opacity-50 cursor-wait' : 'hover:scale-105 active:scale-95'}`}
                  >
                    <span className="material-symbols-outlined">add_to_drive</span>
                    {isUploading ? 'Analizando archivos...' : 'Seleccionar Archivos (PDF)'}
                  </button>
                </div>
              </div>

              {/* Consola de Upload */}
              {uploadLog.length > 0 && (
                <div className="mb-8 bg-slate-950 text-emerald-400 p-4 rounded-xl border border-slate-800 font-mono text-xs shadow-inner h-32 overflow-y-auto">
                  {uploadLog.map((log, lidx) => (
                    <div key={lidx} className="mb-1">
                      <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                      <span className={log.status === 'error' ? 'text-red-400' : log.status === 'success' ? 'text-emerald-300' : 'text-blue-300'}>{log.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inventario Documental */}
              <div className="bg-surface border border-outline-variant/30 rounded-3xl shadow-sm overflow-hidden mb-12">
                <div className="p-6 border-b border-outline-variant/30 bg-slate-100/50 dark:bg-slate-800/20 flex justify-between items-center">
                  <div>
                    <h3 className="font-headline font-bold text-lg flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600 list-alt text-xl" data-icon="memory">task</span>
                      Archivos Disponibles
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Actas procesadas y listas para consultar ({documents.length} archivos)</p>
                  </div>
                  <div className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold shadow-sm">
                    {companyId.toUpperCase()}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-50 dark:bg-slate-900 border-b border-outline-variant/20">
                      <tr>
                        <th className="px-6 py-4 font-bold tracking-widest border-r border-outline-variant/10">Nombre del Documento</th>
                        <th className="px-6 py-4 font-bold tracking-widest border-r border-outline-variant/10">Proyecto</th>
                        <th className="px-6 py-4 font-bold tracking-widest border-r border-outline-variant/10">Fecha Reunión</th>
                        <th className="px-6 py-4 font-bold tracking-widest border-r border-outline-variant/10">Origen</th>
                        <th className="px-6 py-4 font-bold tracking-widest text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50 dark:bg-slate-900/50">
                            Aún no has subido ningún documento.
                          </td>
                        </tr>
                      ) : (
                        documents.map((doc, i) => {
                          const isN8n = doc.tipo && (doc.tipo.toLowerCase().includes('n8n') || doc.tipo.toLowerCase().includes('automát'));
                          return (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4 flex items-center gap-3 border-r border-outline-variant/5">
                              <span className={`p-2 rounded block shadow-sm ${isN8n ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                                <span className="material-symbols-outlined text-[16px] block">{isN8n ? 'integration_instructions' : 'picture_as_pdf'}</span>
                              </span>
                              <span className="font-bold text-slate-700 dark:text-slate-300 max-w-[250px] md:max-w-md truncate" title={doc.name}>{doc.name}</span>
                            </td>
                            <td className="px-6 py-4 border-r border-outline-variant/5 capitalize font-medium">{doc.proyecto !== 'Desconocido' ? doc.proyecto : <span className="text-slate-400 italic">Múltiples</span>}</td>
                            <td className="px-6 py-4 border-r border-outline-variant/5 font-mono text-xs text-slate-500">{doc.fecha}</td>
                            <td className="px-6 py-4 border-r border-outline-variant/5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isN8n ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400'}`}>
                                <span className="material-symbols-outlined text-[12px]">{isN8n ? 'webhook' : 'upload_file'}</span>
                                {isN8n ? 'n8n Auto' : 'PDF Manual'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Listo
                              </span>
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ================= TOAST NOTIFICATION ================= */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border animate-[slideInRight_0.4s_ease-out] ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
            : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
          <span className={`material-symbols-outlined text-xl ${toast.type === 'success' ? 'text-emerald-500' : 'text-blue-500'}`}>
            {toast.type === 'success' ? 'notifications_active' : 'info'}
          </span>
          <span className="font-semibold text-sm max-w-xs">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 p-1 hover:bg-black/10 rounded-full transition-colors">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
