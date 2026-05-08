const API_BASE = "/api";

const state = {
  sessionId: null,
  turns: [],
  totalCost: 0,
  lastLog: "",
};

const els = {
  form: document.querySelector("#askForm"),
  input: document.querySelector("#questionInput"),
  askBtn: document.querySelector("#askBtn"),
  timeline: document.querySelector("#timeline"),
  template: document.querySelector("#turnTemplate"),
  examples: document.querySelector("#examples"),
  healthBtn: document.querySelector("#healthBtn"),
  newSessionBtn: document.querySelector("#newSessionBtn"),
  downloadLogBtn: document.querySelector("#downloadLogBtn"),
  questionCount: document.querySelector("#questionCount"),
  totalCost: document.querySelector("#totalCost"),
  sessionId: document.querySelector("#sessionId"),
  lastChart: document.querySelector("#lastChart"),
  lastRows: document.querySelector("#lastRows"),
  lastVerdict: document.querySelector("#lastVerdict"),
};

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function setBusy(isBusy) {
  els.askBtn.disabled = isBusy;
  els.input.disabled = isBusy;
  els.askBtn.textContent = isBusy ? "Working..." : "Ask";
}

function updateStats(last = null) {
  els.questionCount.textContent = state.turns.length;
  els.totalCost.textContent = formatCurrency(state.totalCost);
  els.sessionId.textContent = state.sessionId ? state.sessionId.slice(0, 8) : "New";
  els.downloadLogBtn.disabled = !state.lastLog;

  if (last) {
    els.lastChart.textContent = last.chart_type || "None";
    els.lastRows.textContent = text(last.row_count || 0);
    els.lastVerdict.textContent = last.verdict || "No";
  }
}

function download(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderTable(columns = [], rows = []) {
  if (!columns.length || !rows.length) {
    return "<p>No rows returned for this question.</p>";
  }

  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((col) => `<td>${escapeHtml(text(row[col]))}</td>`).join("")}</tr>`
    )
    .join("");

  return `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDetails(data) {
  const items = [
    ["Request ID", data.request_id],
    ["Execution ID", data.execution_id],
    ["Cost", formatCurrency(data.cost_usd)],
    ["Bytes scanned", Number(data.bytes_scanned || 0).toLocaleString()],
    ["Chart", data.chart_type || "none"],
    ["Intent mismatch", data.verdict || "No"],
    ["Inferred question", data.inferred_question || "None"],
    ["Discrepancy detail", data.discrepancy_detail || "None"],
  ];

  const flags = [...(data.assumptions || []), ...(data.validation_flags || [])];
  return `
    <div class="detail-grid">
      ${items
        .map(([label, value]) => `<div class="detail-box"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join("")}
    </div>
    ${
      flags.length
        ? `<h3>Assumptions and validation flags</h3><ul>${flags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

function attachTabs(card) {
  const tabs = [...card.querySelectorAll(".tab")];
  const panels = {
    table: card.querySelector(".table-panel"),
    sql: card.querySelector(".sql-panel"),
    details: card.querySelector(".details-panel"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      Object.entries(panels).forEach(([key, panel]) => {
        panel.classList.toggle("hidden", key !== tab.dataset.tab);
      });
    });
  });
}

function createTurn(question) {
  els.timeline.classList.remove("empty");
  const empty = els.timeline.querySelector(".empty-state");
  if (empty) empty.remove();

  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector(".turn-card");
  card.querySelector(".turn-number").textContent = `Question ${state.turns.length + 1}`;
  card.querySelector(".turn-question").textContent = question;
  card.querySelector(".turn-time").textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  attachTabs(card);
  els.timeline.prepend(card);
  return card;
}

function populateTurn(card, data) {
  card.querySelector(".status-line").textContent = "";
  card.querySelector(".insight").textContent = data.insight || "No insight returned.";

  const chartFrame = card.querySelector(".chart-frame");
  chartFrame.innerHTML = "";
  if (data.html_chart) {
    const iframe = document.createElement("iframe");
    iframe.style.height = `${Math.max(Number(data.chart_height || 420), 320)}px`;
    iframe.srcdoc = data.html_chart;
    chartFrame.appendChild(iframe);
  }

  card.querySelector(".table-panel").innerHTML = renderTable(data.columns || [], data.rows || []);
  card.querySelector(".sql-panel").innerHTML = `<pre>${escapeHtml(data.sql || "No SQL for this response.")}</pre>`;
  card.querySelector(".details-panel").innerHTML = renderDetails(data);
  card.querySelector(".download-report").addEventListener("click", () => buildPdf(data));
}

async function ask(question) {
  const card = createTurn(question);
  const status = card.querySelector(".status-line");
  const insight = card.querySelector(".insight");
  const payload = { question };
  if (state.sessionId) payload.session_id = state.sessionId;

  setBusy(true);
  status.textContent = "Connecting to analytics backend...";
  insight.textContent = "";

  try {
    const response = await fetch(`${API_BASE}/ask/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "status") {
          status.textContent = event.text;
        } else if (event.type === "token") {
          insight.textContent += event.text;
        } else if (event.type === "error") {
          throw new Error(event.text);
        } else if (event.type === "done") {
          donePayload = event.data;
        }
      }
    }

    if (!donePayload) throw new Error("The backend stream ended without a result.");

    donePayload.question = question;
    state.sessionId = donePayload.session_id;
    state.turns.push(donePayload);
    state.totalCost += Number(donePayload.cost_usd || 0);
    populateTurn(card, donePayload);
    updateStats(donePayload);
    refreshEngineerLog();
  } catch (err) {
    status.textContent = "Request failed";
    insight.textContent = err.message || String(err);
  } finally {
    setBusy(false);
    els.input.focus();
  }
}

async function buildPdf(data) {
  const response = await fetch(`${API_BASE}/report/pdf`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question: data.question || "",
      insight: data.insight || "",
      assumptions: data.assumptions || [],
      validation_flags: data.validation_flags || [],
      png_b64: data.png_b64 || null,
      columns: data.columns || [],
      rows: data.rows || [],
      chart_type: data.chart_type || "none",
      cost_usd: data.cost_usd || 0,
      bytes_scanned: data.bytes_scanned || 0,
      sql: data.sql || "",
      inferred_question: data.inferred_question || "",
      verdict: data.verdict || "No",
      discrepancy_detail: data.discrepancy_detail || "None",
      request_id: data.request_id || "",
    }),
  });

  if (!response.ok) {
    alert(`Could not build PDF: HTTP ${response.status}`);
    return;
  }

  const payload = await response.json();
  const bytes = Uint8Array.from(atob(payload.pdf_b64), (char) => char.charCodeAt(0));
  download(payload.filename || "edp_analytics_report.pdf", "application/pdf", new Blob([bytes]));
}

async function refreshEngineerLog() {
  if (!state.sessionId) return;
  try {
    const response = await fetch(`${API_BASE}/engineer-log?session_id=${encodeURIComponent(state.sessionId)}`);
    if (!response.ok) return;
    const payload = await response.json();
    state.lastLog = payload.csv || "";
    updateStats();
  } catch {
    // Non-fatal. Log download is a convenience, not part of answering questions.
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error("bad status");
    els.healthBtn.textContent = "Backend online";
    els.healthBtn.classList.add("ok");
    els.healthBtn.classList.remove("bad");
  } catch {
    els.healthBtn.textContent = "Backend offline";
    els.healthBtn.classList.add("bad");
    els.healthBtn.classList.remove("ok");
  }
}

async function loadExamples() {
  try {
    const response = await fetch(`${API_BASE}/examples`);
    const payload = await response.json();
    els.examples.innerHTML = "";
    for (const question of payload.questions || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "example-btn";
      button.textContent = question;
      button.addEventListener("click", () => {
        els.input.value = question;
        els.input.focus();
      });
      els.examples.appendChild(button);
    }
  } catch {
    els.examples.innerHTML = "<p>Examples load when the backend is online.</p>";
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = els.input.value.trim();
  if (!question) return;
  els.input.value = "";
  ask(question);
});

els.newSessionBtn.addEventListener("click", () => {
  state.sessionId = null;
  state.turns = [];
  state.totalCost = 0;
  state.lastLog = "";
  els.timeline.innerHTML = '<div class="empty-state"><h2>No questions yet</h2><p>Try one of the examples, or ask your own question below.</p></div>';
  els.timeline.classList.add("empty");
  updateStats();
});

els.downloadLogBtn.addEventListener("click", () => {
  if (state.lastLog) {
    download(`edp_engineer_log_${state.sessionId.slice(0, 8)}.csv`, "text/csv", state.lastLog);
  }
});

els.healthBtn.addEventListener("click", checkHealth);

checkHealth();
loadExamples();
setInterval(checkHealth, 30000);
