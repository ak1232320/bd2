/**
 * Sentiment Analyzer — dual mode: local Transformers.js or OpenRouter API.
 * Loads reviews from a TSV file, classifies sentiment, displays results.
 * No backend required; runs entirely as a static site.
 */

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

/* ── Module state ── */
let reviews = [];
let classifier = null;   // Transformers.js pipeline (lazy-loaded)
let mode = "local";       // "local" or "api"

/* ── DOM references (set on DOMContentLoaded) ── */
let statusArea, reviewDisplay, resultArea, errorArea, analyzeBtn;
let apiSettings, apiKeyInput, saveKeyBtn;

/* ── Google Sheets logging helpers (reused from root app.js) ── */

/**
 * Get or create a stable user ID stored in localStorage.
 * @returns {string} UUID.
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
 * Send an event log to Google Sheets via the GAS Web App URL.
 * Silently skips if GAS URL is not configured.
 * @param {{event: string, variant: string, meta?: object}} payload
 */
async function sendLogSimple(payload) {
  const url = localStorage.getItem("gas_url");
  if (!url) return; // silently skip if not configured

  const body = new URLSearchParams({
    event: payload.event,
    variant: payload.variant || "",
    userId: getOrCreateUid(),
    ts: String(Date.now()),
    meta: JSON.stringify(payload.meta || {}),
  });

  try {
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) console.warn("Log failed:", res.status);
  } catch (err) {
    console.warn("Log error:", err.message);
  }
}

/**
 * Return common metadata fields.
 * @returns {{page: string, ua: string}}
 */
function baseMeta() {
  return { page: location.pathname, ua: navigator.userAgent };
}

/**
 * Fetch and parse the TSV file, extracting the "text" column.
 * @returns {Promise<number>} Number of reviews loaded.
 */
async function loadReviews() {
  const res = await fetch("reviews_test.tsv");
  if (!res.ok) throw new Error(`HTTP ${res.status} loading TSV`);

  const text = await res.text();
  const parsed = Papa.parse(text, {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
  });

  reviews = parsed.data
    .map((row) => row.text)
    .filter((t) => typeof t === "string" && t.trim() !== "");

  if (reviews.length === 0) throw new Error("No reviews found in TSV");
  return reviews.length;
}

/**
 * Initialize the Transformers.js sentiment-analysis pipeline.
 * Downloads the model on first visit (~67 MB); cached by the browser after that.
 * Called lazily — only when user actually needs local mode.
 */
async function initModel() {
  if (classifier) return; // already loaded
  statusArea.textContent = "Loading local model (may take 30-60 s on first visit)...";
  analyzeBtn.disabled = true;
  classifier = await pipeline(
    "sentiment-analysis",
    "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
  );
  statusArea.textContent = `Ready! ${reviews.length} reviews loaded. (Local model)`;
  analyzeBtn.disabled = false;
}

/**
 * Classify a review via the OpenRouter API (chat completions).
 * Uses a free model. The API returns a label parsed from the response text.
 * @param {string} text - Review text to classify.
 * @returns {Promise<{label: string, score: number}>}
 */
async function classifyViaApi(text) {
  const key = localStorage.getItem("openrouter_key");
  if (!key) throw new Error("API key not set — save your OpenRouter key first.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            'Classify the sentiment. Reply with ONLY valid JSON: {"label":"POSITIVE","score":0.95}. Label must be POSITIVE, NEGATIVE, or NEUTRAL. Score is your confidence 0.0-1.0. No other text.',
        },
        { role: "user", content: text },
      ],
      max_tokens: 30,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 120)}`);
  }

  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || "").trim();

  // Try to parse JSON response with label and score
  try {
    const parsed = JSON.parse(raw);
    const label = (parsed.label || "NEUTRAL").toUpperCase();
    const score = typeof parsed.score === "number" ? parsed.score : 0.7;
    return { label, score };
  } catch {
    // Fallback: extract label from text, use 0.7 as default confidence
    const upper = raw.toUpperCase();
    let label = "NEUTRAL";
    if (upper.includes("POSITIVE")) label = "POSITIVE";
    else if (upper.includes("NEGATIVE")) label = "NEGATIVE";
    return { label, score: 0.7 };
  }
}

/**
 * Map raw model output to a three-bucket sentiment label.
 * @param {string} label - "POSITIVE", "NEGATIVE", or "NEUTRAL".
 * @param {number} score - Confidence score 0–1.
 * @returns {"positive"|"negative"|"neutral"}
 */
function mapSentiment(label, score) {
  if (label === "POSITIVE" && score > 0.5) return "positive";
  if (label === "NEGATIVE" && score > 0.5) return "negative";
  return "neutral";
}

/** Icon and display-label maps keyed by sentiment bucket. */
const ICON = {
  positive: "fa-solid fa-thumbs-up",
  negative: "fa-solid fa-thumbs-down",
  neutral: "fa-solid fa-circle-question",
};
const LABEL = { positive: "Positive", negative: "Negative", neutral: "Neutral" };

/**
 * Update the result area with the sentiment icon, label, and confidence.
 * @param {string} sentiment - "positive", "negative", or "neutral".
 * @param {number} score - Confidence 0–1.
 */
function displayResult(sentiment, score) {
  resultArea.className = sentiment;
  const confidenceText = `${(score * 100).toFixed(1)}% confidence`;
  resultArea.innerHTML =
    `<div class="result-icon"><i class="${ICON[sentiment]}"></i></div>` +
    `<div>${LABEL[sentiment]}</div>` +
    `<div class="confidence">${confidenceText}</div>`;
}

/** Show an error message in the error banner. */
function showError(msg) {
  errorArea.textContent = msg;
  errorArea.style.display = "block";
  console.error(msg);
}

/** Hide the error banner. */
function clearError() {
  errorArea.textContent = "";
  errorArea.style.display = "none";
}

/**
 * Pick a random review, run inference (local or API), and update the UI.
 * Disables the button while analysis is in progress.
 */
async function analyzeReview() {
  clearError();

  if (reviews.length === 0) {
    showError("Reviews not loaded yet.");
    return;
  }

  if (mode === "local" && !classifier) {
    showError("Local model not loaded yet. Please wait.");
    return;
  }

  analyzeBtn.disabled = true;
  const review = reviews[Math.floor(Math.random() * reviews.length)];
  reviewDisplay.textContent = review;
  resultArea.className = "loading";
  resultArea.innerHTML = "Analyzing...";

  try {
    let label, score;

    if (mode === "local") {
      const output = await classifier(review);
      ({ label, score } = output[0]);
    } else {
      ({ label, score } = await classifyViaApi(review));
    }

    const sentiment = mapSentiment(label, score);
    displayResult(sentiment, score);

    // Log to Google Sheets (non-blocking, silently fails if not configured)
    sendLogSimple({
      event: "sentiment_analysis",
      variant: sentiment,
      meta: {
        ...baseMeta(),
        mode: mode,
        score: score,
        review: review.slice(0, 100),
      },
    });
  } catch (err) {
    showError("Analysis failed: " + err.message);
    resultArea.className = "";
  } finally {
    analyzeBtn.disabled = false;
  }
}

/**
 * Handle mode toggle: show/hide API settings, update status, lazy-load model.
 * @param {string} newMode - "local" or "api".
 */
async function switchMode(newMode) {
  mode = newMode;

  if (mode === "api") {
    apiSettings.classList.add("visible");
    if (reviews.length > 0) {
      statusArea.textContent = `Ready! ${reviews.length} reviews loaded. (API mode)`;
      analyzeBtn.disabled = false;
    }
  } else {
    apiSettings.classList.remove("visible");
    if (!classifier) {
      try {
        await initModel();
      } catch (err) {
        showError("Failed to load local model: " + err.message);
        statusArea.textContent = "Model load failed.";
      }
    } else if (reviews.length > 0) {
      statusArea.textContent = `Ready! ${reviews.length} reviews loaded. (Local model)`;
      analyzeBtn.disabled = false;
    }
  }
}

/* ── Initialization ── */

document.addEventListener("DOMContentLoaded", async () => {
  statusArea = document.getElementById("status-area");
  reviewDisplay = document.getElementById("review-display");
  resultArea = document.getElementById("result-area");
  errorArea = document.getElementById("error-area");
  analyzeBtn = document.getElementById("analyzeBtn");
  apiSettings = document.getElementById("api-settings");
  apiKeyInput = document.getElementById("apiKey");
  saveKeyBtn = document.getElementById("saveKey");

  // Wire button
  analyzeBtn.addEventListener("click", analyzeReview);

  // Wire mode toggle
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => switchMode(e.target.value));
  });

  // Wire API key save
  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showError("Enter an API key first.");
      return;
    }
    localStorage.setItem("openrouter_key", key);
    statusArea.textContent = "API key saved.";
  });

  // Hydrate API key from localStorage
  const savedKey = localStorage.getItem("openrouter_key");
  if (savedKey) apiKeyInput.value = savedKey;

  // Wire GAS URL save
  const gasUrlInput = document.getElementById("gasUrl");
  const saveGasUrlBtn = document.getElementById("saveGasUrl");

  if (gasUrlInput && saveGasUrlBtn) {
    // Hydrate from localStorage
    const savedGasUrl = localStorage.getItem("gas_url");
    if (savedGasUrl) gasUrlInput.value = savedGasUrl;

    saveGasUrlBtn.addEventListener("click", () => {
      const val = gasUrlInput.value.trim();
      if (val && !val.endsWith("/exec")) {
        alert("URL must end with /exec");
        return;
      }
      if (val) {
        localStorage.setItem("gas_url", val);
        statusArea.textContent = "GAS URL saved. Logs will be sent to Google Sheets.";
      } else {
        localStorage.removeItem("gas_url");
        statusArea.textContent = "GAS URL removed. Logging disabled.";
      }
    });
  }

  // Load reviews (needed for both modes)
  try {
    statusArea.textContent = "Loading reviews...";
    const count = await loadReviews();

    // Start local model loading (default mode)
    statusArea.textContent = "Loading local model (may take 30-60 s on first visit)...";
    try {
      await initModel();
    } catch (err) {
      // Model failed but reviews loaded — API mode still works
      console.error("Local model load failed:", err);
      statusArea.textContent = `${count} reviews loaded. Local model failed — switch to API mode.`;
      analyzeBtn.disabled = false;
    }
  } catch (err) {
    showError("Initialization failed: " + err.message);
    statusArea.textContent = "Failed to load reviews.";
  }
});
