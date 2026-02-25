(() => {

  const BASE_URL = "https://tomos.bot";

  // 🚫 Evitar que embed.js se ejecute dentro del panel admin o dentro del iframe de preview
  if (window.self !== window.top) {
    console.warn("Embed.js deshabilitado dentro del panel admin");
    return;
  }

  const AVAILABLE_FONTS = [
    "Manrope",
    "Inter",
    "Poppins",
    "Roboto",
    "Playfair Display",
    "Merriweather"
  ];
  const SUPPORTED_LANGUAGES = ["es", "en", "fr", "de", "pt"];

  const normalizeLanguage = (value) => {
    const normalized = (value || "").toString().trim().toLowerCase();
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : "";
  };

  const resolveLocalizedText = (labels = {}, preferred, fallback) => {
    if (!labels || typeof labels !== "object") return "";
    const preferredKey = normalizeLanguage(preferred);
    const fallbackKey = normalizeLanguage(fallback || preferred);
    const direct = labels[preferredKey];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const fallbackValue = labels[fallbackKey];
    if (typeof fallbackValue === "string" && fallbackValue.trim()) return fallbackValue.trim();
    return "";
  };

  const BUBBLE_DISMISSED_KEY = "tomosBubbleDismissedAt";
  const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

  const shouldShowBubbleFromStorage = () => {
    try {
      const dismissedAt = localStorage.getItem(BUBBLE_DISMISSED_KEY);
      if (!dismissedAt) return true;
      const dismissedAtNumber = Number(dismissedAt);
      if (!Number.isFinite(dismissedAtNumber)) {
        localStorage.removeItem(BUBBLE_DISMISSED_KEY);
        return true;
      }
      if (Date.now() - dismissedAtNumber > ONE_DAY_IN_MS) {
        localStorage.removeItem(BUBBLE_DISMISSED_KEY);
        return true;
      }
      return false;
    } catch {
      return true;
    }
  };

  const saveBubbleDismissedAt = (timestamp) => {
    try {
      localStorage.setItem(BUBBLE_DISMISSED_KEY, String(timestamp));
    } catch {}
  };

  const getBrowserLanguage = () => {
    const raw = (navigator.language || "en").split("-")[0].toLowerCase();
    return normalizeLanguage(raw);
  };

  const normalizeOrigin = (value) => {
    if (!value) return "";
    const raw = value.toString().trim();
    if (raw === "*") return "*";
    try {
      const url = new URL(raw);
      return url.origin;
    } catch (err) {
      return "";
    }
  };

  const toOriginList = (val) => {
    if (Array.isArray(val)) return val.map(normalizeOrigin).filter(Boolean);
    if (val && typeof val === "object") return Object.values(val).map(normalizeOrigin).filter(Boolean);
    if (typeof val === "string") return [normalizeOrigin(val)].filter(Boolean);
    return [];
  };

  async function loadBotConfig(empresaId, botId) {
    const normalizedEmpresaId = (empresaId || "").trim();
    const normalizedBotId = (botId || "default").trim() || "default";
    const cacheKey = `bot-config-${normalizedEmpresaId}-${normalizedBotId}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 86400000) {
          return parsed.data;
        }
      }
    } catch {}

    try {
      const configUrl = new URL(`/config/${encodeURIComponent(normalizedEmpresaId)}/${encodeURIComponent(normalizedBotId)}.json`, BASE_URL);
      const res = await fetch(configUrl.toString());
      if (res.ok) {
        const data = await res.json();
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
        } catch {}
        return data;
      }
    } catch {
      // CORS, 404 u otro error de red — continuar con valores por defecto
    }

    return { allowedOrigins: ["*"] };
  }

  const main = async () => {
    const script = document.currentScript;
    let scriptUrl = null;
    let pageUrl = null;
    try {
      scriptUrl = script?.src ? new URL(script.src, window.location.href) : null;
    } catch (err) {
      scriptUrl = null;
    }
    try {
      pageUrl = new URL(window.location.href);
    } catch (err) {
      pageUrl = null;
    }

    const empresaAttr = (
      script?.dataset?.empresa ||
      scriptUrl?.searchParams.get("empresa") ||
      pageUrl?.searchParams.get("empresa") ||
      "Boletum"
    ).trim();
    const botAttr = (
      script?.dataset?.bot ||
      scriptUrl?.searchParams.get("bot") ||
      pageUrl?.searchParams.get("bot") ||
      ""
    ).trim();
    const empresa = empresaAttr || "Boletum";
    const botId = botAttr || "default";
    const params = new URLSearchParams({ empresa });
    if (botAttr) params.set("bot", botAttr);
    params.set("hideLocation", "1");
    const iframeUrl = new URL("/chat.html", BASE_URL);
    iframeUrl.search = params.toString();
    const iframeSrc = iframeUrl.toString();

    const pageOrigin = pageUrl?.origin || window.location.origin;
    const externalOrigin = window.location.origin;
    const config = await loadBotConfig(empresa, botId);
    const allowedOrigins = toOriginList(config?.allowedOrigins);
    if (allowedOrigins.length && pageOrigin) {
      if (!allowedOrigins.includes("*") && !allowedOrigins.includes(pageOrigin)) {
        console.warn("El chat está bloqueado para este sitio.", pageOrigin);
        return;
      }
    }

    // 🔹 Crear host + Shadow DOM para aislar estilos del sitio externo
    const host = document.createElement("div");
    host.id = "tomos-chat-widget-root";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const applyFontFamily = (font) => {
      const fallback = "'Manrope', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const safeFont = (font || "").trim();
      const finalFont = safeFont
        ? `'${safeFont}', system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
        : fallback;
      host.style.setProperty("--chat-font-family", finalFont);

      const fontId = safeFont ? `tomos-font-${safeFont.replace(/\s+/g, "-").toLowerCase()}` : null;
      if (safeFont && AVAILABLE_FONTS.includes(safeFont)) {
        if (!document.getElementById(fontId)) {
          const link = document.createElement("link");
          link.id = fontId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFont)}:wght@400;500;600;700&display=swap`;
          document.head.appendChild(link);
        }
      }
    };

    applyFontFamily();

    // 💅 Estilos del widget (dentro del Shadow DOM)
    const style = document.createElement("style");
    style.textContent = `
    :host {
      font-family: var(--chat-font-family, 'Manrope', system-ui, -apple-system, Segoe UI, Roboto, sans-serif);
    }
    #chatWidgetBtn {
      position: fixed; bottom: 24px; left: auto; right: 24px; z-index: 99999;
      --widget-horizontal-translate: 0;
      background: #111; color: #fff; border: none;
      border-radius: 50%; /* valor por defecto, se sobrescribe dinámicamente */
      width: 60px; height: 60px; display: none; align-items: center;
      justify-content: center; cursor: pointer;
      box-shadow: 0 4px 8px rgba(0,0,0,0.25);
      transition: transform .25s ease, box-shadow .25s ease, border-radius .25s ease;
      transform: translateX(var(--widget-horizontal-translate));
      font-family: inherit;
    }
    #chatWidgetBtn[data-position="left"] {
      left: 24px;
      right: auto;
      --widget-horizontal-translate: 0;
    }
    #chatWidgetBtn[data-position="center"] {
      left: 50%;
      right: auto;
      --widget-horizontal-translate: -50%;
    }
    #chatWidgetBtn[data-position="right"] {
      right: 24px;
      left: auto;
      --widget-horizontal-translate: 0;
    }
    #chatWidgetBtn:hover {
      transform: translateX(var(--widget-horizontal-translate)) scale(1.05);
      box-shadow: 0 6px 14px rgba(0,0,0,0.3);
    }
        #chatWidgetBtn::after {

    }

#chatWidgetBubble {
  position: fixed;
  bottom: 96px;
  left: auto;
  right: 24px;
  --widget-bubble-translate: 0;
  background: #ffffff;
  color: #1f2937;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  padding: 12px 12px 12px 14px;
  display: none;
  gap: 10px;
  align-items: flex-start;
  cursor: pointer;
  z-index: 99999;
  max-width: 320px;
  transform: translateX(var(--widget-bubble-translate));
  font-family: inherit;
}

#chatWidgetBubble[data-position="left"] {
  left: 24px;
  right: auto;
  --widget-bubble-translate: 0;
}

#chatWidgetBubble[data-position="center"] {
  left: 50%;
  right: auto;
  --widget-bubble-translate: -50%;
}

#chatWidgetBubble[data-position="right"] {
  right: 24px;
  left: auto;
  --widget-bubble-translate: 0;
}

#chatWidgetBubble::after {
  content: "";
  position: absolute;
  bottom: -6px;
  right: 28px;
  width: 14px;
  height: 14px;
  background: #ffffff;
  transform: rotate(45deg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}

#chatWidgetBubble[data-position="left"]::after {
  left: 28px;
  right: auto;
}

#chatWidgetBubble[data-position="center"]::after {
  left: 50%;
  right: auto;
  transform: translateX(-50%) rotate(45deg);
}

#chatWidgetBubbleMessage {
  font-size: 14px;
  line-height: 1.4;
  margin-right: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-family: inherit;
}

#chatWidgetBubbleClose {
  background: #eef0f2;
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

#chatWidgetBubbleClose svg {
  width: 12px;
  height: 12px;
  stroke: #6b7280;
  stroke-width: 2.5;
}


#chatWidgetFrame {
  position: fixed;
  bottom: 90px;
  left: auto;
  right: auto;
  width: 420px;
  max-height: calc(100vh - 110px);
  height: 90vh;
  border: none;
  border-radius: 18px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.2);
  display: block;              /* importante: siempre presente para animar */
  z-index: 99999;
  overflow: hidden;

  /* 🚀 ANIMACIÓN NUEVA */
  opacity: 0;
  transform: translateX(var(--widget-frame-translate)) scale(0);
  transform-origin: center bottom; /* se expande desde el botón */
  transition:
    transform 0.28s cubic-bezier(0, 1.2, 1, 1),
    opacity 0.18s ease-out;

  pointer-events: none;
}

#chatWidgetFrame.is-visible {
  opacity: 1;
  transform: translateX(var(--widget-frame-translate)) scale(1);
  pointer-events: auto;
}



    #chatWidgetFrame[data-position="left"] {
      left: 24px;
      right: auto;
      --widget-frame-translate: 0;
    }
    #chatWidgetFrame[data-position="center"] {
      left: 50%;
      right: auto;
      --widget-frame-translate: -50%;
    }
    #chatWidgetFrame[data-position="right"] {
      right: 24px;
      left: auto;
      --widget-frame-translate: 0;
    }
    @media (max-width:640px){
      #chatWidgetFrame,
      #chatWidgetFrame[data-position="left"],
      #chatWidgetFrame[data-position="center"],
      #chatWidgetFrame[data-position="right"]{
        width:100%;height:100%;bottom:0;left:0;right:0;border-radius:0;
        --widget-frame-translate:0;transform: translateY(20px);
      }
      #chatWidgetFrame.is-visible,
      #chatWidgetFrame.is-visible[data-position="left"],
      #chatWidgetFrame.is-visible[data-position="center"],
      #chatWidgetFrame.is-visible[data-position="right"]{
        transform: translateY(0);
      }
    }
  `;
    // 🔹 estilos dentro del shadow, no en <head>
    shadow.appendChild(style);

    // 🧩 Crear elementos (dentro del Shadow DOM)
    const btn = document.createElement("button");
    btn.id = "chatWidgetBtn";

    const ICON_STORAGE_KEY = "tomos.chat.icon";
    let iconReady = false;
    let originalIconElement = null;
    let originalIconColor = null;
    let isChatOpen = false;

    const bubble = document.createElement("div");
    bubble.id = "chatWidgetBubble";
    const bubbleMessage = document.createElement("div");
    bubbleMessage.id = "chatWidgetBubbleMessage";
    const bubbleClose = document.createElement("button");
    bubbleClose.id = "chatWidgetBubbleClose";
    bubbleClose.setAttribute("aria-label", "Cerrar mensaje");
    bubbleClose.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none">
    <line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>
    <line x1="6" y1="18" x2="18" y2="6" stroke-linecap="round"/>
  </svg>
`;
    bubble.append(bubbleMessage, bubbleClose);

    const frame = document.createElement("iframe");
    frame.id = "chatWidgetFrame";
    // 💰 FIREBASE COST: NO asignar frame.src todavía.
    // El iframe se carga en diferido (lazy) — solo cuando el usuario hace clic en el botón
    // o cuando autoOpen está activo. Esto elimina TODAS las conexiones Firebase para
    // visitantes que nunca abren el chat (típicamente el 90%+ del tráfico).
    frame.allow = "clipboard-write; clipboard-read";

    // 🔹 Todo vive dentro del shadow
    shadow.append(btn, bubble, frame);

    // Flag: ¿ya se cargó el iframe?
    let frameLoaded = false;

    // Carga el iframe bajo demanda (primera vez que se necesita)
    const ensureFrameLoaded = () => {
      if (frameLoaded) return Promise.resolve();
      frameLoaded = true;
      frame.src = iframeSrc;
      return new Promise((resolve) => {
        const onLoad = () => { frame.removeEventListener('load', onLoad); resolve(); };
        frame.addEventListener('load', onLoad);
        // Fallback si load no dispara
        setTimeout(resolve, 5000);
      });
    };

    // 🔄 Comunicación con el iframe
    let ready = false, got = false, currentPosition = 'right';
    let bubbleText = "";
    let bubbleConfig = null;
    let bubbleBaseLanguage = "";
    let bubbleLanguage = getBrowserLanguage();
    let pendingVisibility = null;
    let positionResolved = false;
    let positionResolveTimeout = null;
    let pendingBubble = false;
    let autoOpenEnabled = false;
    let autoOpenTriggered = false;
    let bubbleDismissed = !shouldShowBubbleFromStorage();

    const hideBubble = () => {
      bubble.style.display = "none";
    };

    const dismissBubble = () => {
      bubbleDismissed = true;
      hideBubble();
      saveBubbleDismissedAt(Date.now());
    };

    const resetBubbleIfExpired = () => {
      bubbleDismissed = !shouldShowBubbleFromStorage();
    };

    const deriveIconColor = (element) => {
      const target = element?.querySelector ? (element.querySelector("svg") || element) : element;
      if (target?.tagName?.toLowerCase() === "svg") {
        const fill = target.getAttribute("fill") || target.style?.fill;
        if (fill && fill !== "none") return fill;
        const colorAttr = target.getAttribute("color") || target.style?.color;
        if (colorAttr && colorAttr !== "none") return colorAttr;
        const computed = getComputedStyle(target);
        if (computed?.fill && computed.fill !== "none") return computed.fill;
        if (computed?.color && computed.color !== "none") return computed.color;
      }
      const buttonColor = getComputedStyle(btn).color;
      return buttonColor || "currentColor";
    };

    const setButtonIcon = (node) => {
      btn.innerHTML = "";
      if (node) btn.appendChild(node);
    };

    const renderCloseIcon = () => {
      const color = originalIconColor || deriveIconColor(btn);
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "28");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", color);
      svg.setAttribute("stroke-width", "2.5");
      svg.setAttribute("stroke-linecap", "round");

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", "6");
      line1.setAttribute("y1", "6");
      line1.setAttribute("x2", "18");
      line1.setAttribute("y2", "18");

      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", "6");
      line2.setAttribute("y1", "18");
      line2.setAttribute("x2", "18");
      line2.setAttribute("y2", "6");

      svg.append(line1, line2);
      setButtonIcon(svg);
    };

    const restoreOriginalIcon = () => {
      if (originalIconElement) {
        setButtonIcon(originalIconElement.cloneNode(true));
      }
    };

    const showCloseIcon = () => {
      renderCloseIcon();
      isChatOpen = true;
    };

    const showOriginalIcon = () => {
      restoreOriginalIcon();
      isChatOpen = false;
    };

    const syncVisibility = () => {
      // 💰 FIREBASE COST: con lazy load no necesitamos esperar al iframe para mostrar el botón.
      // El botón se muestra apenas iconReady=true (inmediato con el ícono por defecto o cacheado).
      if (!iconReady) return;

      // Si no hay visibilidad del iframe aún, asumimos visible=true (default)
      const shouldShow = pendingVisibility !== false;
      btn.style.display = shouldShow ? "flex" : "none";

      if (!shouldShow) {
        frame.style.display = "none";
        hideBubble();
        return;
      }

      // Posición puede resolverse sin iframe
      if (!positionResolved) {
        // Aplicar posición por defecto inmediatamente
        if (!positionResolved) {
          positionResolved = true;
        }
      }

      maybeShowBubble();
    };

    const applyWidgetPosition = (position, markResolved = false) => {
      const normalized = (position || '').toString().trim().toLowerCase();
      const valid = ['left', 'center', 'right'];
      const finalPos = valid.includes(normalized) ? normalized : 'right';
      currentPosition = finalPos;
      btn.dataset.position = finalPos;
      frame.dataset.position = finalPos;
      bubble.dataset.position = finalPos;

      if (markResolved) {
        positionResolved = true;
        if (positionResolveTimeout) {
          clearTimeout(positionResolveTimeout);
          positionResolveTimeout = null;
        }
        syncVisibility();
        if (pendingBubble) {
          maybeShowBubble();
        }
      }
    };

    const getBubbleBaseText = () => {
      if (!bubbleConfig) return "";
      const sourceLanguage = normalizeLanguage(bubbleConfig?.sourceLanguage || bubbleBaseLanguage);
      const labels = bubbleConfig?.labels && typeof bubbleConfig.labels === "object" ? bubbleConfig.labels : {};
      const baseLabel = sourceLanguage ? labels[sourceLanguage] : "";
      const baseText = (typeof baseLabel === "string" ? baseLabel.trim() : "") || (bubbleConfig.text || "").toString().trim();
      return baseText;
    };

    const updateBubbleTextForLanguage = (language) => {
      if (!bubbleConfig?.enabled) {
        bubbleText = "";
        hideBubble();
        return;
      }
      const normalizedLanguage = normalizeLanguage(language) || bubbleLanguage;
      const baseText = getBubbleBaseText();
      if (!baseText) {
        bubbleText = "";
        hideBubble();
        return;
      }
      const sourceLanguage = normalizeLanguage(bubbleConfig?.sourceLanguage || bubbleBaseLanguage) || bubbleBaseLanguage;
      const resolved = resolveLocalizedText(bubbleConfig?.labels, normalizedLanguage, sourceLanguage);
      bubbleText = (resolved || baseText || "").toString().trim();
      if (!bubbleText) {
        hideBubble();
        return;
      }
      maybeShowBubble();
    };

    const maybeShowBubble = () => {
      if (!bubbleText) return;
      if (isChatOpen) return;
      resetBubbleIfExpired();
      if (bubbleDismissed) return;
      if (btn.style.display === "none") return;
      if (!positionResolved) {
        pendingBubble = true;
        return;
      }

      pendingBubble = false;
      bubbleMessage.textContent = bubbleText;
      bubble.style.display = "flex";
      bubble.dataset.position = currentPosition;
    };

    const tryAutoOpenChat = () => {
      if (!autoOpenEnabled || autoOpenTriggered) return;
      if (pendingVisibility === false) return;
      autoOpenTriggered = true;
      openChat();
    };

    const openChat = () => {
      isChatOpen = true;
      hideBubble();
      frame.style.display = "block";
      // 💰 FIREBASE COST: cargar el iframe ahora (primera vez que se abre el chat)
      ensureFrameLoaded().then(() => {
        requestAnimationFrame(() => frame.classList.add("is-visible"));
      });
      showCloseIcon();
      const openFn = () => {
        frame.contentWindow.postMessage({ action: "openChatWindow" }, "*");
        frame.contentWindow.postMessage({ action: "chatOpened" }, "*");
      };
      if (ready) {
        openFn();
      } else {
        const i = setInterval(() => {
          if (ready) {
            clearInterval(i);
            openFn();
          }
        }, 50);
      }
    };

    const closeChat = () => {
      isChatOpen = false;
      frame.classList.remove("is-visible");
      const hideFrame = () => {
        frame.style.display = "none";
        frame.removeEventListener("transitionend", hideFrame);
      };
      frame.addEventListener("transitionend", hideFrame);
      setTimeout(hideFrame, 300);
      showOriginalIcon();
      maybeShowBubble();
    };

    applyWidgetPosition(currentPosition);

    const applyChatButtonIcon = (data, options = {}) => {
      if (!data) return;
      const iconPayload = {
        imageUrl: data.imageUrl || "",
        svg: data.svg || "",
        radius: data.radius
      };
      if (!iconPayload.imageUrl && !iconPayload.svg) return;

      btn.innerHTML = "";
      btn.setAttribute("data-loaded", iconPayload.imageUrl || iconPayload.svg || "");

      if (typeof iconPayload.radius !== "undefined") {
        btn.style.borderRadius = iconPayload.radius + "%";
      }

      if (iconPayload.imageUrl) {
        const img = document.createElement("img");
        img.src = iconPayload.imageUrl;
        img.alt = "chat icon";
        img.style.width = "28px";
        img.style.height = "28px";
        img.style.objectFit = "contain";
        btn.appendChild(img);
      } else if (iconPayload.svg?.includes("<svg")) {
        const svg = new DOMParser()
          .parseFromString(iconPayload.svg, "image/svg+xml")
          .querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "28");
          svg.setAttribute("height", "28");
          btn.appendChild(svg);
        }
      }

      originalIconElement = btn.firstElementChild ? btn.firstElementChild.cloneNode(true) : null;
      originalIconColor = deriveIconColor(originalIconElement || btn);
      iconReady = true;

      if (options.persist !== false) {
        try {
          sessionStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(iconPayload));
        } catch {}
      }

      if (isChatOpen) {
        showCloseIcon();
      }

      syncVisibility();
    };

    const BUTTON_COLOR_KEY = "tomos.chat.btnColor";

    const restoreIconFromSession = () => {
      try {
        const stored = sessionStorage.getItem(ICON_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (parsed?.imageUrl || parsed?.svg) {
          applyChatButtonIcon(parsed, { persist: false });
        }
      } catch {}
      // Restaurar color del botón (guardado separado)
      try {
        const color = sessionStorage.getItem(BUTTON_COLOR_KEY);
        if (color) btn.style.backgroundColor = color;
      } catch {}
    };

    restoreIconFromSession();

    // Carga ícono, color y posición desde Firebase REST API — sin SDK, sin iframe.
    const DB_URL = "https://timbre-c9547-default-rtdb.europe-west1.firebasedatabase.app";
    const loadButtonAppearance = async (empresa, bot) => {
      if (iconReady) return;
      try {
        const botPath = `empresas/${encodeURIComponent(empresa)}/bots/${encodeURIComponent(bot)}/config`;
        const res = await fetch(`${DB_URL}/${botPath}.json?shallow=false`);
        if (!res.ok) return;
        const cfg = await res.json();
        if (!cfg) return;

        // Visibilidad
        if (cfg.chatVisible === false) {
          pendingVisibility = false;
          syncVisibility();
          return;
        }
        pendingVisibility = true;

        // Posición
        applyWidgetPosition(cfg.widgetPosition || 'right', true);

        // Color del botón — persistir para restauración inmediata en siguiente carga
        if (cfg.chatButtonColor) {
          btn.style.backgroundColor = cfg.chatButtonColor;
          try { sessionStorage.setItem(BUTTON_COLOR_KEY, cfg.chatButtonColor); } catch {}
        }

        // Ícono — puede ser string path ("wids/6.svg"), objeto {imageUrl,svg}, o nulo
        const radius = typeof cfg.widgetRadius === 'number' ? cfg.widgetRadius : 50;
        const icon = cfg.widgetIcon;

        if (typeof icon === 'string' && icon.trim()) {
          // Path relativo como "wids/6.svg" → fetch del SVG desde BASE_URL
          const svgUrl = new URL(icon, BASE_URL).toString();
          try {
            const svgRes = await fetch(svgUrl);
            if (svgRes.ok) {
              const svgText = await svgRes.text();
              const iconColor = cfg.widgetIconColor || '#FFFFFF';
              // Aplicar color al SVG
              const coloredSvg = svgText
                .replace(/<svg/, `<svg fill="${iconColor}" color="${iconColor}"`)
                .replace(/stroke="(?!none)[^"]*"/g, `stroke="${iconColor}"`);
              applyChatButtonIcon({ svg: coloredSvg, radius }, { persist: true });
            }
          } catch {}
        } else if (icon?.imageUrl || icon?.svg) {
          applyChatButtonIcon({ imageUrl: icon.imageUrl || '', svg: icon.svg || '', radius }, { persist: true });
        }

        // Fallback si no se pudo cargar el ícono
        if (!iconReady) {
          const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
          applyChatButtonIcon({ svg: defaultSvg, radius }, { persist: false });
        }
      } catch {
        if (!iconReady) {
          const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
          applyChatButtonIcon({ svg: defaultSvg, radius: 50 }, { persist: false });
          positionResolved = true;
          syncVisibility();
        }
      }
    };
    loadButtonAppearance(empresa, botId);

    applyFontFamily(config?.fontFamily);
    const welcomeText = (config?.welcome || "").toString().trim();
    if (welcomeText) {
      bubbleConfig = {
        enabled: true,
        text: welcomeText,
        labels: {},
        sourceLanguage: ""
      };
      bubbleBaseLanguage = "";
      bubbleLanguage = getBrowserLanguage() || bubbleLanguage;
      updateBubbleTextForLanguage(bubbleLanguage);
    }

    bubbleClose.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissBubble();
    });

    bubble.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest('#chatWidgetBubbleClose')) return;
      openChat();
    });

    let externalOriginSent = false;

    window.addEventListener("message", (e) => {
      if (e.origin !== BASE_URL) return;
      const d = e.data || {};

      switch (d.action) {

        case "chatReady":
          ready = true;
          // Actualizar ícono real desde Firebase (reemplaza el ícono por defecto/cacheado)
          frame.contentWindow.postMessage({ action: "getChatButtonIcon" }, "*");
          frame.contentWindow.postMessage({ action: "getChatButtonStatus" }, "*");
          // Posición ya está resuelta, pero la actualizamos con el valor real de Firebase
          if (!positionResolved) {
            positionResolved = true;
            syncVisibility();
          }
          break;

        case "chatButtonIcon":
          applyChatButtonIcon(d);
          break;

        case "chatButtonStatus":
          got = true;
          pendingVisibility = d.visible === false ? false : true;
          syncVisibility();
          break;

        case "autoOpenChat":
          autoOpenEnabled = d.enabled === true;
          if (!autoOpenEnabled) {
            autoOpenTriggered = false;
          }
          tryAutoOpenChat();
          break;

        case "chatLanguageChanged":
          if (d.language) {
            bubbleLanguage = normalizeLanguage(d.language) || bubbleLanguage;
            updateBubbleTextForLanguage(bubbleLanguage);
          }
          break;

        case "updateChatButtonColor":
          if (d.color) btn.style.backgroundColor = d.color;
          break;

        case "updateWidgetPosition":
          applyWidgetPosition(d.position, true);
          break;

        case "closeChatWindow":
          closeChat();
          break;
        case "requestExternalOrigin":
          if (externalOriginSent) break;
          externalOriginSent = true;
          try {
            frame.contentWindow.postMessage(
              { action: "externalOrigin", externalOrigin: pageOrigin || externalOrigin || "" },
              "*"
            );
          } catch {}
          break;
      }
    });

    // 🖱️ Clic en el botón → alternar abrir/cerrar chat
    btn.onclick = () => {
      if (isChatOpen) {
        closeChat();
      } else {
        openChat();
      }
    };

    // 💰 FIREBASE COST: el ping al iframe se elimina.
    // Con lazy load, el iframe solo existe después de que el usuario hace clic.
    // El ícono y posición se obtienen del sessionStorage o config.json, no del iframe.
  };

  main();
})();
