// app.js — Event Logger logic. Zero dependencies, CORS-safe simple requests.

/**
 * Return a stable pseudo user id, creating one on first visit.
 * Uses crypto.randomUUID() (widely supported since 2022).
 * @returns {string} UUID stored under localStorage key "uid".
 */
function getOrCreateUid() {
  let uid = localStorage.getItem("uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("uid", uid);
  }
  return uid;
}

/**
 * Send an event payload to the saved Google Apps Script Web App URL.
 *
 * Builds a URLSearchParams body so the browser sends
 * Content-Type: application/x-www-form-urlencoded automatically,
 * which qualifies as a CORS "simple request" (no preflight).
 *
 * @param {{ event: string, variant: string, meta?: object }} payload
 * @returns {Promise<void>} Updates #status with the outcome.
 */
async function sendLogSimple(payload) {
  const status = document.getElementById("status");
  const url = localStorage.getItem("gas_url");

  if (!url) {
    status.textContent = "Missing Web App URL — save one first.";
    return;
  }

  const body = new URLSearchParams({
    event: payload.event,
    variant: payload.variant || "",
    userId: getOrCreateUid(),
    ts: String(Date.now()),
    meta: JSON.stringify(payload.meta || {}),
  });

  try {
    // No headers object — keeps the request "simple" for CORS.
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) {
      status.textContent = `HTTP ${res.status}`;
      return;
    }
    status.textContent = "Logged ✓";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
}

/** Common meta fields attached to every event. */
function baseMeta() {
  return { page: location.pathname, ua: navigator.userAgent };
}

// --- Initialisation & wiring ---

(function init() {
  const gasInput = document.getElementById("gasUrl");
  const status = document.getElementById("status");

  // Hydrate input from localStorage.
  const saved = localStorage.getItem("gas_url");
  if (saved) gasInput.value = saved;

  // Ensure uid exists early.
  getOrCreateUid();

  document.getElementById("saveUrl").addEventListener("click", () => {
    const val = gasInput.value.trim();
    if (!val.endsWith("/exec")) {
      status.textContent = "Invalid URL — must end with /exec";
      return;
    }
    localStorage.setItem("gas_url", val);
    status.textContent = "URL saved.";
  });

  document.getElementById("ctaA").addEventListener("click", () => {
    sendLogSimple({ event: "cta_click", variant: "A", meta: baseMeta() });
  });

  document.getElementById("ctaB").addEventListener("click", () => {
    sendLogSimple({ event: "cta_click", variant: "B", meta: baseMeta() });
  });

  document.getElementById("heartbeat").addEventListener("click", () => {
    sendLogSimple({ event: "heartbeat", variant: "", meta: baseMeta() });
  });
})();
