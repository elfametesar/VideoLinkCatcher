console.log("content script loaded");

let currentPopup = null;
let mouseX = 0;
let mouseY = 0;

document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, true);

function querySelectorAllDeep(selector, root = document) {
  const results = [];
  const walk = (node) => {
    node.querySelectorAll(selector).forEach(el => results.push(el));
    node.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) walk(el.shadowRoot);
    });
  };
  walk(root);
  return results;
}

function findVideoAtPoint(x, y) {
  const elements = document.elementsFromPoint(x, y);
  const direct = elements.find(el => el.tagName === "VIDEO");
  if (direct) return direct;

  const all = querySelectorAllDeep("video");
  if (all.length === 0) return null;

  return all.find(v => {
    const r = v.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) || null;
}

function extractVideoUrl(video) {
  const candidates = [];
  video.querySelectorAll("source").forEach(s => {
    if (s.src && !s.src.startsWith("blob:")) candidates.push(s.src);
  });
  if (video.currentSrc && !video.currentSrc.startsWith("blob:")) candidates.push(video.currentSrc);
  if (video.src && !video.src.startsWith("blob:")) candidates.push(video.src);
  const mp4 = candidates.find(u => u.includes(".mp4") && !/audio/.test(u));
  if (mp4) return mp4;
  const nonAudio = candidates.find(u => !/audio/.test(u));
  if (nonAudio) return nonAudio;
  if (candidates.length > 0) return candidates[0];
  return null;
}

function dismissPopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
}

window.addEventListener("scroll", dismissPopup, true);

window.addEventListener("keydown", async (e) => {
  if (!e.altKey && !e.metaKey) return;
  if (currentPopup) return;

  const video = findVideoAtPoint(mouseX, mouseY);
  if (!video) return;

  e.stopImmediatePropagation();

  currentPopup = createDownloadPopup(null, mouseX, mouseY, true);

  await browser.runtime.sendMessage({ action: "clearVideoUrls" });
  let videoUrl = extractVideoUrl(video);

  if (!videoUrl) {
    await new Promise(res => setTimeout(res, 300));
    const response = await browser.runtime.sendMessage({ action: "getVideoUrl" });
    videoUrl = response?.url || null;
  }

  if (!videoUrl) {
    updatePopupError("No video found");
    return;
  }

  updatePopupUrl(videoUrl);
}, true);

function updatePopupUrl(url) {
  if (!currentPopup) return;
  const dlBtn = currentPopup.querySelector("#vc-dl");
  if (!dlBtn) return;
  dlBtn.onclick = () => {
    window.open(url, "_blank");
    dismissPopup();
  };
  dlBtn.style.opacity = "1";
  dlBtn.style.cursor = "pointer";
  dlBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download
  `;
}

function updatePopupError(msg) {
  if (!currentPopup) return;
  const dlBtn = currentPopup.querySelector("#vc-dl");
  if (!dlBtn) return;
  dlBtn.textContent = "⚠ " + msg;
  dlBtn.style.color = "rgba(255,200,0,0.8)";
  dlBtn.style.cursor = "default";
}

function createDownloadPopup(videoUrl, x, y, loading = false) {
  const popup = document.createElement("div");
  popup.id = "video-catcher-popup";
  Object.assign(popup.style, {
    position: "fixed",
    top: y + "px",
    left: x + "px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(15,15,15,0.88)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "8px 14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    backdropFilter: "blur(12px)",
    webkitBackdropFilter: "blur(12px)"
  });

  const dlBtn = document.createElement("button");
  dlBtn.id = "vc-dl";
  Object.assign(dlBtn.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "500",
    cursor: loading ? "wait" : "pointer",
    padding: "0",
    fontFamily: "inherit",
    opacity: loading ? "0.5" : "1"
  });

  dlBtn.innerHTML = loading ? "Fetching..." : `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download
  `;

  if (videoUrl) {
    dlBtn.onclick = () => {
      window.open(videoUrl, "_blank");
      dismissPopup();
    };
  }

  const divider = document.createElement("div");
  Object.assign(divider.style, {
    width: "1px",
    height: "16px",
    background: "rgba(255,255,255,0.15)",
    flexShrink: "0"
  });

  const closeBtn = document.createElement("button");
  Object.assign(closeBtn.style, {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    fontSize: "13px",
    cursor: "pointer",
    padding: "0",
    lineHeight: "1",
    fontFamily: "inherit"
  });
  closeBtn.textContent = "✕";
  closeBtn.onmouseenter = () => closeBtn.style.color = "#fff";
  closeBtn.onmouseleave = () => closeBtn.style.color = "rgba(255,255,255,0.4)";
  closeBtn.onclick = () => dismissPopup();

  popup.appendChild(dlBtn);
  popup.appendChild(divider);
  popup.appendChild(closeBtn);
  document.body.appendChild(popup);

  return popup;
}
