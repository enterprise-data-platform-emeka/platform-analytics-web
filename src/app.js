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
  historyList: document.querySelector("#historyList"),
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

function formatValue(value, column = "") {
  const raw = text(value).replaceAll(",", "").replaceAll("$", "").replaceAll("€", "");
  const num = Number(raw);
  if (!Number.isFinite(num)) return text(value);

  const moneyHints = ["revenue", "amount", "sales", "profit", "income", "spend", "price", "value", "payment"];
  const prefix = moneyHints.some((hint) => column.toLowerCase().includes(hint)) ? "€" : "";
  return `${prefix}${num.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(num) ? 0 : 2,
  })}`;
}

function labelize(column) {
  return text(column)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPeriod(value) {
  const raw = text(value).trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (!match) return raw;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function periodSortValue(value) {
  const raw = text(value).trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (!match) return `z-${raw}`;
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function isNumericValue(value) {
  const raw = text(value).replaceAll(",", "").replaceAll("$", "").replaceAll("€", "");
  return raw !== "" && Number.isFinite(Number(raw));
}

function extractKpis(columns = [], rows = []) {
  if (!columns.length || !rows.length) return [];

  const timeHints = ["year", "month", "date", "week", "quarter", "period"];
  const metricPriority = ["revenue", "amount", "sales", "profit", "income", "spend", "price", "value", "payment"];
  const metricAny = ["revenue", "total", "amount", "sales", "profit", "sum", "value", "orders", "avg", "average"];
  const countHints = ["count", "customers", "users", "visitors", "quantity", "qty"];
  const rankHints = ["rank", "position", "pos", "row_num", "row_number", "rn", "ntile", "dense_rank"];

  const numericCols = [];
  const catCols = [];

  for (const col of columns) {
    if (timeHints.some((hint) => col.toLowerCase().includes(hint))) {
      catCols.push(col);
      continue;
    }

    const firstValue = rows.map((row) => row[col]).find((value) => text(value).trim() && !["none", "null"].includes(text(value).toLowerCase()));
    if (isNumericValue(firstValue)) numericCols.push(col);
    else catCols.push(col);
  }

  const isRankCol = (col) => {
    const lower = col.toLowerCase();
    return rankHints.includes(lower) || lower.endsWith("_rank") || lower.endsWith("_position") || lower.endsWith("_pos");
  };

  const pickMetric = (cols) => {
    const candidates = cols.filter((col) => !isRankCol(col));
    const usable = candidates.length ? candidates : cols;
    return (
      usable.find((col) => metricPriority.some((hint) => col.toLowerCase().includes(hint))) ||
      usable.find((col) => metricAny.some((hint) => col.toLowerCase().includes(hint)) && !countHints.some((hint) => col.toLowerCase().includes(hint))) ||
      usable.find((col) => metricAny.some((hint) => col.toLowerCase().includes(hint))) ||
      usable[usable.length - 1]
    );
  };

  const kpis = [];

  if (catCols.length && numericCols.length) {
    const metricCol = pickMetric(numericCols);
    const catCol = catCols[0];
    const yearCol = catCols.find((col) => col.toLowerCase().includes("year"));
    const monthCol = catCols.find((col) => col.toLowerCase().includes("month") && col !== yearCol);
    const isTime = timeHints.some((hint) => catCol.toLowerCase().includes(hint)) || Boolean(yearCol && monthCol);

    const periodFor = (row) => {
      if (yearCol && monthCol) {
        const year = text(row[yearCol]);
        const month = text(row[monthCol]);
        if (/^\d+$/.test(year) && /^\d+$/.test(month)) return `${year}-${month.padStart(2, "0")}-01`;
      }
      return text(row[catCol]);
    };

    const orderedRows = isTime ? [...rows].sort((a, b) => periodSortValue(periodFor(a)).localeCompare(periodSortValue(periodFor(b)))) : rows;

    if (isTime && numericCols.length > 1) {
      for (const col of numericCols.slice(0, 3)) {
        const row = [...orderedRows].reverse().find((item) => text(item[col]).trim() && !["none", "null"].includes(text(item[col]).toLowerCase()));
        if (row) kpis.push({ label: labelize(col), value: formatValue(row[col], col), sub: formatPeriod(periodFor(row)), badge: "" });
      }
      return kpis;
    }

    const displayRow = isTime ? orderedRows[orderedRows.length - 1] : rows[0];
    const category = isTime ? formatPeriod(periodFor(displayRow)) : labelize(displayRow[catCol]);
    let badge = "";

    if (isTime && orderedRows.length >= 2) {
      const current = Number(text(orderedRows[orderedRows.length - 1][metricCol]).replaceAll(",", ""));
      const previous = Number(text(orderedRows[orderedRows.length - 2][metricCol]).replaceAll(",", ""));
      if (Number.isFinite(current) && Number.isFinite(previous) && previous !== 0) {
        const pct = ((current - previous) / Math.abs(previous)) * 100;
        badge = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs prior`;
      }
    }

    kpis.push({ label: labelize(metricCol), value: formatValue(displayRow[metricCol], metricCol), sub: category, badge });
    kpis.push({ label: isTime ? "Periods Covered" : "Total Entries", value: rows.length.toLocaleString(), sub: isTime ? "Periods" : labelize(catCol), badge: "" });

    const total = rows.reduce((sum, row) => {
      const value = Number(text(row[metricCol]).replaceAll(",", ""));
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const firstPeriod = isTime ? formatPeriod(periodFor(orderedRows[0])) : "All entries";
    const lastPeriod = isTime ? formatPeriod(periodFor(orderedRows[orderedRows.length - 1])) : "";
    const baseMetric = labelize(metricCol.replace(/^total_/i, "").replace(/_total$/i, ""));
    kpis.push({
      label: `Total ${baseMetric} (All)`,
      value: formatValue(total, metricCol),
      sub: isTime ? `${firstPeriod} - ${lastPeriod}` : "All entries",
      badge: "",
    });
  } else if (numericCols.length) {
    for (const col of numericCols.slice(0, 3)) {
      kpis.push({ label: labelize(col), value: formatValue(rows[0][col], col), sub: "", badge: "" });
    }
  }

  return kpis.slice(0, 3);
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
    els.lastVerdict.textContent = last.verdict === "Yes" ? "Mismatch" : "Matched";
  }
}

function updateHistory() {
  if (!els.historyList) return;
  if (!state.turns.length) {
    els.historyList.innerHTML = "<p>No questions yet.</p>";
    return;
  }

  els.historyList.innerHTML = state.turns
    .map((turn, index) => `<div class="history-item"><span>${index + 1}</span><p>${escapeHtml(turn.question || "Question")}</p></div>`)
    .join("");
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

function renderKpis(columns = [], rows = []) {
  const kpis = extractKpis(columns, rows);
  if (!kpis.length) return "";

  return kpis
    .map((kpi) => {
      const trendClass = kpi.badge.startsWith("-") ? "negative" : "positive";
      return `
        <div class="kpi-card">
          <span>${escapeHtml(kpi.label)}</span>
          <strong>${escapeHtml(kpi.value)}</strong>
          ${kpi.sub ? `<small>${escapeHtml(kpi.sub)}</small>` : ""}
          ${kpi.badge ? `<em class="${trendClass}">${escapeHtml(kpi.badge)}</em>` : ""}
        </div>
      `;
    })
    .join("");
}

function rowsToCsv(columns = [], rows = []) {
  const escapeCsv = (value) => {
    const raw = text(value);
    return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };

  return [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(",")),
  ].join("\n");
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

  card.querySelector(".kpi-grid").innerHTML = renderKpis(data.columns || [], data.rows || []);
  card.querySelector(".table-panel").innerHTML = renderTable(data.columns || [], data.rows || []);
  card.querySelector(".sql-panel").innerHTML = `<pre>${escapeHtml(data.sql || "No SQL for this response.")}</pre>`;
  card.querySelector(".details-panel").innerHTML = renderDetails(data);
  const csvButton = card.querySelector(".download-csv");
  csvButton.disabled = !(data.columns || []).length || !(data.rows || []).length;
  csvButton.addEventListener("click", () => {
    const number = Math.max(state.turns.findIndex((turn) => turn.request_id === data.request_id) + 1, 1);
    download(`edp_data_q${number}.csv`, "text/csv", rowsToCsv(data.columns || [], data.rows || []));
  });
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
    updateHistory();
    refreshEngineerLog();
  } catch (err) {
    card.classList.add("failed");
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
  els.timeline.innerHTML = '<div class="empty-state"><h2>No questions yet</h2><p>Ask a business question below to generate an insight, KPI summary, chart, and evidence table.</p></div>';
  els.timeline.classList.add("empty");
  updateStats();
  updateHistory();
});

els.downloadLogBtn.addEventListener("click", () => {
  if (state.lastLog) {
    download(`edp_engineer_log_${state.sessionId.slice(0, 8)}.csv`, "text/csv", state.lastLog);
  }
});

els.healthBtn.addEventListener("click", checkHealth);

checkHealth();
setInterval(checkHealth, 30000);
