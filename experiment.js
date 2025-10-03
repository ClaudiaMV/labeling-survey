// experiment.js  — CSV, reusable for any number of narrations
// - Uses ALL narrations by default (no fixed cap)
// - Control count via ?n=all or ?n=NUMBER (e.g., ?n=30)
// - Optional reproducible order via ?seed=STRING
// - Optional Apps Script endpoint for Google Sheets saving

const APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbw5R3FyHF2YcoRb_9FItK3Ye08Ow3x9CVVbZSCenU3IMbFyTqvJBslB7ELWAiQ24jA2/exec"; // leave blank to download CSV locally
const REQUIRE_AT_LEAST_ONE_LABEL = true;

// ---------- CSV parsing ----------
function parseCSV(text) {
  const rows = [];
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let i = 0, field = "", row = [], inQuotes = false;
  function endField(){ row.push(field); field=""; }
  function endRow(){ rows.push(row); row=[]; }
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i+1] === '"') { field += '"'; i+=2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { endField(); i++; continue; }
      if (c === "\n") { endField(); endRow(); i++; continue; }
      field += c; i++; continue;
    }
  }
  endField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) endRow();
  return rows;
}

// ---------- Seeded RNG (for reproducible shuffles) ----------
function xmur3(str) {
  // small string hash → uint32
  let h = 1779033703 ^ str.length;
  for (let i=0; i<str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(array, seedStr) {
  if (!seedStr) return shuffle(array);
  const seed = xmur3(String(seedStr))();
  const rand = mulberry32(seed);
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffle(array) {
  const a = array.slice();
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Load narrations from CSV (auto-map columns) ----------
async function loadNarrationsCSV() {
  const res = await fetch("narrations.csv", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load narrations.csv");
  const text = await res.text();
  const rows = parseCSV(text);
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  // Build objects with all columns preserved
  const arr = dataRows.map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").toString().trim(); });
    return o;
  });

  // Detect required columns (case-insensitive)
  const lower = headers.map(h => h.toLowerCase());
  const idKey =
    headers[lower.indexOf("narration_id")] ??
    headers[lower.indexOf("id")] ??
    headers[0]; // fallback first col
  const textKey =
    headers[lower.indexOf("narration_text")] ??
    headers[lower.indexOf("text")] ??
    headers[lower.indexOf("narration")] ??
    headers[1]; // fallback second col
  // Optional enabled column
  const enabledKey = (function(){
    const candidates = ["enabled", "include", "use", "active"];
    for (const c of candidates) {
      const idx = lower.indexOf(c);
      if (idx !== -1) return headers[idx];
    }
    return null;
  })();

  // Map + optional filter by enabled == truthy (1/true/yes)
  const truthy = v => /^(1|true|yes|y)$/i.test((v || "").toString().trim());
  const out = [];
  for (const row of arr) {
    const narration_id = (row[idKey] || "").toString().trim();
    const narration_text = (row[textKey] || "").toString().trim();
    if (!narration_id || !narration_text) continue;
    if (enabledKey && !truthy(row[enabledKey])) continue; // if enabled column exists, require truthy
    out.push({ narration_id, narration_text });
  }
  return out;
}

// ---------- Helpers ----------
function splitClean(s) {
  if (!s) return [];
  return s.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}
function chipsHTML(bank) {
  if (!bank || bank.length === 0) {
    return '<div class="small">No suggestions yet — your own labels will appear here on later items.</div>';
  }
  return bank.map(lbl => {
    const esc = lbl.replace(/"/g, "&quot;");
    return `<label class="label-chip"><input type="checkbox" name="existing" value="${esc}"> ${esc}</label>`;
  }).join("");
}
function trialHTML(narration, bank) {
  return `
  <div>
    <h2>Narration</h2>
    <p>${narration.narration_text}</p>
    <hr>
    <h3>Select from your suggestions</h3>
    <div>${chipsHTML(bank)}</div>
    <div style="margin-top:12px;">
      <label><strong>Add NEW labels</strong> (comma-separated):</label><br>
      <input id="new_labels" type="text" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;" placeholder="e.g., kitchen, fridge, search"/>
    </div>
    <hr>
    <h3>Memory rating</h3>
    <div class="range-wrap">
      <span>1</span>
      <input type="range" id="mem" min="1" max="7" step="1" value="4" oninput="document.getElementById('mem_out').textContent=this.value">
      <span>7</span>
      <span>Current: <strong id="mem_out">4</strong></span>
    </div>
    <div class="actions">
      <button id="next_btn">Next</button>
    </div>
  </div>`;
}

// ---------- Main ----------
(async function main(){
  // URL controls: ?n=all or ?n=NUMBER, ?seed=STRING, ?pid=
  const qs = new URLSearchParams(window.location.search);
  const nParam = (qs.get("n") || "").toLowerCase();
  const seedParam = qs.get("seed") || "";
  const pid = qs.get("pid") || window.prompt("Participant ID (e.g., P01):", "") || "";
  const session = "001";

  // Load full pool
  const narrations = await loadNarrationsCSV();
  const totalAvailable = narrations.length;
  if (totalAvailable === 0) {
    alert("No narrations found in narrations.csv");
    return;
  }

  // Choose order (seeded if provided)
  const ordered = seededShuffle(narrations, seedParam);

  // Determine how many to run
  let target = Infinity;
  if (nParam && nParam !== "all") {
    const n = parseInt(nParam, 10);
    if (!isNaN(n) && n > 0) target = n;
  }
  const items = ordered.slice(0, Math.min(target, totalAvailable));
  const N_TRIALS = items.length;

  // Participant-level label bank
  const labelBank = [];

  // Init jsPsych
  const jsPsych = initJsPsych({
    on_finish: async function(){
      const payload = {
        participant: pid,
        session: session,
        timestamp: new Date().toISOString(),
        records: jsPsych.data.get().values(),
        final_label_bank: labelBank
      };
      if (APPS_SCRIPT_ENDPOINT && APPS_SCRIPT_ENDPOINT.startsWith("https")) {
        try {
          await fetch(APPS_SCRIPT_ENDPOINT, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          alert("Thanks! Your responses have been submitted.");
        } catch (e) {
          console.error(e);
          alert("Finished. Could not submit automatically. A CSV will now download.");
          jsPsych.data.get().localSave("csv", (pid || "participant") + "_labeling.csv");
        }
      } else {
        jsPsych.data.get().localSave("csv", (pid || "participant") + "_labeling.csv");
        alert("Finished. A CSV download should start now.");
      }
    }
  });

  const timeline = [];

  // Welcome
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="container">
        <h2>Welcome</h2>
        <p>This session contains <strong>${N_TRIALS}</strong> narrations (from ${totalAvailable} available).</p>
        <p>For each narration, select any labels from your own growing suggestion list (it starts empty), and/or add new labels (comma-separated).</p>
        <p>Then rate how well you remember the video described (1–7).</p>
      </div>
    `,
    choices: ["Begin"]
  });

  // Trials
  items.forEach((item, idx) => {
    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: function(){
        return `<div class="container">${trialHTML(item, labelBank)}</div>`;
      },
      on_load: function(){
        document.getElementById("next_btn").addEventListener("click", () => {
          const checked = Array.from(document.querySelectorAll('input[name="existing"]:checked')).map(i => i.value);
          const newLabels = splitClean(document.getElementById("new_labels").value);
          const combined = [...checked, ...newLabels].filter((v,i,a)=>a.indexOf(v)===i);

          if (REQUIRE_AT_LEAST_ONE_LABEL && combined.length === 0) {
            alert("Please select at least one label or add a new one.");
            return;
          }

          combined.forEach(lbl => { if (!labelBank.includes(lbl)) labelBank.push(lbl); });
          const memory_rating = parseInt(document.getElementById("mem").value, 10);

          jsPsych.data.write({
            trial_index: idx + 1,
            n_trials_total: N_TRIALS,
            narration_id: item.narration_id,
            narration_text: item.narration_text,
            selected_labels: checked.join(","),
            new_labels: newLabels.join(","),
            all_labels: combined.join(","),
            memory_rating: memory_rating,
            label_bank_snapshot: labelBank.join(","),
            participant: pid,
            session: session,
            seed: seedParam || ""
          });

          jsPsych.finishTrial();
        });
      }
    });
  });

  // End
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="container"><h2>End</h2><p>Thanks for participating!</p></div>`,
    choices: ["Submit"]
  });

  jsPsych.run(timeline);
})();
