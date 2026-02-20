(() => {

  // 🚫 Evitar que embed.js se ejecute dentro del panel admin o dentro del iframe de preview
  if (window.location.hostname === "tomos.bot") {
    console.warn("Embed.js deshabilitado dentro del panel admin");
    return;
  }

  const FIREBASE_DB_URL = "https://timbre-c9547-default-rtdb.europe-west1.firebasedatabase.app";

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
    try {
      const url = new URL(value);
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

  async function fetchChatBubbleConfig(empresa, botId) {
    const safeEmpresa = encodeURIComponent(empresa || "");
    const safeBot = encodeURIComponent(botId || "default");
    const candidatePaths = [
      `empresas/${safeEmpresa}/config/bots/${safeBot}/config/chatBubble`,
      `empresas/${safeEmpresa}/bots/${safeBot}/config/chatBubble`,
      `${safeEmpresa}/bots/${safeBot}/config/chatBubble`
    ];

    for (const path of candidatePaths) {
      const url = `${FIREBASE_DB_URL}/${path}.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && typeof data === "object") return data;
      } catch (err) {
        console.warn("No se pudo cargar el chat bubble", err);
      }
    }

    return null;
  }

  async function fetchBaseLanguage(empresa, botId) {
    const safeEmpresa = encodeURIComponent(empresa || "");
    const safeBot = encodeURIComponent(botId || "default");
    const candidatePaths = [
      `empresas/${safeEmpresa}/config/bots/${safeBot}/config/baseLanguage`,
      `empresas/${safeEmpresa}/bots/${safeBot}/config/baseLanguage`,
      `${safeEmpresa}/bots/${safeBot}/config/baseLanguage`
    ];

    for (const path of candidatePaths) {
      const url = `${FIREBASE_DB_URL}/${path}.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (typeof data === "string" && data.trim()) return data.trim();
      } catch (err) {
        console.warn("No se pudo cargar el idioma base del bot", err);
      }
    }

    return "";
  }

  async function fetchFontFamily(empresa, botId) {
    const safeEmpresa = encodeURIComponent(empresa || "");
    const safeBot = encodeURIComponent(botId || "default");
    const candidatePaths = [
      `empresas/${safeEmpresa}/config/bots/${safeBot}/config/fontFamily`,
      `empresas/${safeEmpresa}/bots/${safeBot}/config/fontFamily`,
      `${safeEmpresa}/bots/${safeBot}/config/fontFamily`
    ];

    for (const path of candidatePaths) {
      const url = `${FIREBASE_DB_URL}/${path}.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (typeof data === "string" && data.trim()) return data.trim();
      } catch (err) {
        console.warn("No se pudo cargar la tipografía del widget", err);
      }
    }

    return "";
  }

  async function fetchAllowedOrigins(empresa, botId) {
    const safeEmpresa = encodeURIComponent(empresa || "");
    const safeBot = encodeURIComponent(botId || "default");
    const candidatePaths = [
      `empresas/${safeEmpresa}/config/bots/${safeBot}/config/allowedUrls`,
      `empresas/${safeEmpresa}/bots/${safeBot}/config/allowedUrls`,
      `${safeEmpresa}/bots/${safeBot}/config/allowedUrls`
    ];

    for (const path of candidatePaths) {
      const url = `${FIREBASE_DB_URL}/${path}.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const origins = toOriginList(data);
        if (origins.length) return origins;
      } catch (err) {
        console.warn("No se pudieron cargar las URLs permitidas", err);
      }
    }

    return [];
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
    const iframeSrc = `https://tomos.bot/chat.html?${params.toString()}`;

    const pageOrigin = pageUrl?.origin || window.location.origin;
    const externalOrigin = window.location.origin;
    const allowedOrigins = await fetchAllowedOrigins(empresa, botAttr);
    if (allowedOrigins.length && pageOrigin) {
      if (!allowedOrigins.includes(pageOrigin)) {
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
    frame.src = iframeSrc;
    frame.allow = "clipboard-write; clipboard-read";

    // 🔹 Todo vive dentro del shadow
    shadow.append(btn, bubble, frame);

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
      if (pendingVisibility === null) return;
      if (!positionResolved) return;
      if (!iconReady) {
        btn.style.display = "none";
        return;
      }

      btn.style.display = pendingVisibility ? "flex" : "none";
      if (!pendingVisibility) {
        frame.style.display = "none";
        hideBubble();
        return;
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
      requestAnimationFrame(() => frame.classList.add("is-visible"));
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

    const restoreIconFromSession = () => {
      try {
        const stored = sessionStorage.getItem(ICON_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (parsed?.imageUrl || parsed?.svg) {
          applyChatButtonIcon(parsed, { persist: false });
        }
      } catch {}
    };

    restoreIconFromSession();

    const [font, chatBubbleConfig, baseLanguage] = await Promise.all([
      fetchFontFamily(empresa, botId),
      fetchChatBubbleConfig(empresa, botId),
      fetchBaseLanguage(empresa, botId)
    ]);
    applyFontFamily(font);
    bubbleConfig = chatBubbleConfig;
    bubbleBaseLanguage = normalizeLanguage(baseLanguage) || "";
    if (bubbleConfig?.enabled) {
      const browserLanguage = getBrowserLanguage();
      bubbleLanguage = browserLanguage || bubbleLanguage;
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
      if (!e.origin.includes("tomos.bot")) return;
      const d = e.data || {};

      switch (d.action) {

        case "chatReady":
          ready = true;
          if (!iconReady) {
            frame.contentWindow.postMessage({ action: "getChatButtonIcon" }, "*");
          }
          frame.contentWindow.postMessage({ action: "getChatButtonStatus" }, "*");
          if (!positionResolved) {
            if (positionResolveTimeout) clearTimeout(positionResolveTimeout);
            positionResolveTimeout = setTimeout(() => {
              positionResolved = true;
              positionResolveTimeout = null;
              syncVisibility();
              if (pendingBubble) {
                maybeShowBubble();
              }
            }, 500);
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

    // ⏳ Solicitar estado e ícono periódicamente hasta que responda
    const ping = setInterval(() => {
      if (got && iconReady) { clearInterval(ping); return; }
      try {
        frame.contentWindow.postMessage({ action: "getChatButtonStatus" }, "*");
        if (!iconReady) {
          frame.contentWindow.postMessage({ action: "getChatButtonIcon" }, "*");
        }
      } catch {}
    }, 800);
    setTimeout(() => clearInterval(ping), 6000);
  };

  main();
})();
