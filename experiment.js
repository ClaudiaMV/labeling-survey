// --- ESM imports (v7) ---
// (Resolved by your import map in index.html)
import { initJsPsych } from "jspsych";
import HtmlButtonResponse from "@jspsych/plugin-html-button-response";
import HtmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";

/**
 * Labeling / Category Survey
 * - CSV selectable via ?csv= path (default: data/narrations_v1.csv)
 * - Limit count via ?n=NUMBER or ?n=all
 * - Reproducible order via ?seed=STRING
 * - Participant via ?pid=ID (or prompt)
 * - Per-trial autosave + final upload to Google Apps Script
 */

// ========================== CONFIG ==========================
const APPS_SCRIPT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbyghpxnJU60w-XaBq_s-wnpNa9dJd7HGfYpI4Hw-zkjxmKZhc4u4EB9wPsn69MZ0nY1/exec";
const REQUIRE_AT_LEAST_ONE_LABEL = true;

// ======================= INSTRUCTIONS =======================
const INSTRUCTIONS_HTML = `
  <div class="container" style="max-width:800px; margin:0 auto; text-align:left;">
    <h2>Instructions</h2>

    <p>Thank you for taking part in this task. Your role is to help us create <strong>categories</strong> that can be used to describe a wide range of narrated videos.</p>

    <p>You will read several short <strong>narrations</strong> that describe different scenes. After reviewing each narration, your goal is to identify the <strong>key types of information</strong> that could be used to describe other, similar narrations.</p>

    <hr>

    <h3>What to Do</h3>
    <ol>
      <li><strong>Read the narration carefully.</strong>
        <ul><li>Focus on what is being described rather than how it is written.</li></ul>
      </li>
      <li><strong>Identify important elements.</strong>
        <ul><li>Think about what kinds of things are mentioned; for example, <em>places, actions, people, emotions, objects,</em> or <em>interactions</em>.</li></ul>
      </li>
      <li><strong>Create categories.</strong>
        <ul>
          <li>For each narration, list the <strong>broad categories</strong> that could capture the main information in the scene.</li>
          <li>Each category should be general enough to apply to other narrations.</li>
        </ul>
      </li>
      <li><strong>Avoid narrative retelling.</strong>
        <ul><li>You are not re-describing the scene. Instead, identify <em>types</em> or <em>dimensions</em> of information that appear in the narration.</li></ul>
      </li>
      <li><strong>Use clear and concise category names.</strong>
        <ul><li>A category should be a <em>single word or short phrase</em> (e.g., <em>Emotion</em>, <em>Interaction Type</em>, <em>Movement</em>, <em>Time of Day</em>).</li></ul>
      </li>
      <li><strong>Add new categories when needed.</strong>
        <ul><li>If a narration includes something not covered by your existing list, create a new category for it.</li></ul>
      </li>
    </ol>

    <h3>Tips</h3>
    <ul>
      <li>Categories describe <strong>what kind of information</strong> the narration conveys, not specific content from one video.</li>
      <li>Ask yourself whether your categories would still make sense for a completely different narration.</li>
      <li>There are no “right” or “wrong” answers; we’re interested in how people naturally organize descriptive information.</li>
    </ul>
  </div>
`;

// ===================== URL PARAMETERS =======================
const qs = new URLSearchParams(window.location.search);
const csvParam = qs.get("csv") || "data/narrations_v1.csv";
const nParam = (qs.get("n") || "").toLowerCase();
const seedParam = qs.get("seed") || "";

// ======================== CSV PARSER ========================
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

// =================== SEEDED RANDOMIZATION ===================
function xmur3(str) {
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
function shuffle(array) {
  const a = array.slice();
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

// ============= LOAD NARRATIONS FROM SELECTED CSV ============
async function loadNarrationsCSV() {
  const res = await fetch(csvParam, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + csvParam);
  const text = await res.text();
  const rows = parseCSV(text);
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const arr = dataRows.map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").toString().trim(); });
    return o;
  });

  const lower = headers.map(h => h.toLowerCase());
  const idKey =
    headers[lower.indexOf("narration_id")] ??
    headers[lower.indexOf("id")] ??
    headers[0];
  const textKey =
    headers[lower.indexOf("narration_text")] ??
    headers[lower.indexOf("text")] ??
    headers[lower.indexOf("narration")] ??
    headers[1];

  const enabledKey = (() => {
    for (const c of ["enabled", "include", "use", "active"]) {
      const idx = lower.indexOf(c);
      if (idx !== -1) return headers[idx];
    }
    return null;
  })();

  const truthy = v => /^(1|true|yes|y)$/i.test((v || "").toString().trim());
  const out = [];
  for (const row of arr) {
    const narration_id = (row[idKey] || "").toString().trim();
    const narration_text = (row[textKey] || "").toString().trim();
    if (!narration_id || !narration_text) continue;
    if (enabledKey && !truthy(row[enabledKey])) continue;
    out.push({ narration_id, narration_text });
  }
  return out;
}

// ========================= HELPERS ==========================
function splitClean(s) {
  if (!s) return [];
  return s.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}
function chipsHTML(bank) {
  if (!bank || bank.length === 0) {
    return '<div class="small">No suggestions yet — your own categories will appear here on later items.</div>';
  }
  return bank.map(lbl => {
    const esc = lbl.replace(/"/g, "&quot;");
    return `<label class="label-chip"><input type="checkbox" name="existing" value="${esc}"> ${esc}</label>`;
  }).join("");
}
function memoryCheckboxesHTML() {
  // 1–7 single-choice checkbox group (mutual exclusivity enforced in on_load)
  let html = `<div id="mem_group" class="mem-checkboxes" style="display:flex; gap:10px; flex-wrap:wrap;">`;
  for (let v = 1; v <= 7; v++) {
    html += `
      <label style="display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;">
        <input type="checkbox" name="mem" value="${v}"> ${v}
      </label>`;
  }
  html += `</div><div class="small" style="margin-top:6px;">Select one.</div>`;
  return html;
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
      <label><strong>Add NEW category</strong> (comma-separated):</label><br>
      <input id="new_labels" type="text" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;" placeholder="e.g., Location, Action, Agent, Emotion"/>
    </div>
    <hr>
    <h3>How well do you remember the video described?</h3>
    ${memoryCheckboxesHTML()}
    <div class="actions" style="margin-top:12px;">
      <button id="next_btn">Next</button>
    </div>
  </div>`;
}

// =========================== MAIN ===========================
(async function main(){
  const pid = qs.get("pid") || window.prompt("Participant ID:", "") || "";
  const session = "001";

  // Load narrations
  const narrations = await loadNarrationsCSV();
  const totalAvailable = narrations.length;
  if (totalAvailable === 0) {
    alert("No narrations found in: " + csvParam);
    return;
  }

  // Order and count
  const ordered = seededShuffle(narrations, seedParam);
  let target = Infinity;
  if (nParam && nParam !== "all") {
    const n = parseInt(nParam, 10);
    if (!isNaN(n) && n > 0) target = n;
  }
  const items = ordered.slice(0, Math.min(target, totalAvailable));
  const N_TRIALS = items.length;

  // Participant-level category bank
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
          // Use no headers with no-cors to avoid opaque body issues
          await fetch(APPS_SCRIPT_ENDPOINT, {
            method: "POST",
            mode: "no-cors",
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

  // Build timeline
  const timeline = [];

  // Welcome
  const csvName = csvParam.split("/").pop();
  timeline.push({
    type: HtmlButtonResponse,
    stimulus: `
      <div class="container">
        <h2>Welcome</h2>
        <p>This session contains <strong>${N_TRIALS}</strong> narrations (from ${totalAvailable} available).</p>
        <p>For each narration, you will create <strong>categories</strong> that capture the main kinds of information in the scene.</p>
        <p>Using list: <code>${csvName}</code></p>
        <p>Next, you'll see detailed instructions and an example.</p>
      </div>
    `,
    choices: ["Show me the instructions"]
  });

  // Instructions
  timeline.push({
    type: HtmlButtonResponse,
    stimulus: INSTRUCTIONS_HTML,
    choices: ["I’m ready to start"]
  });

  // Trials
  items.forEach((item, idx) => {
    timeline.push({
      type: HtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: function(){
        return `<div class="container">${trialHTML(item, labelBank)}</div>`;
      },
      on_load: function(){
        // Make the memory checkboxes behave like radios (only one can be checked)
        const memBoxes = Array.from(document.querySelectorAll('input[name="mem"]'));
        memBoxes.forEach(box => {
          box.addEventListener('change', () => {
            if (box.checked) {
              memBoxes.forEach(b => { if (b !== box) b.checked = false; });
            }
          });
        });

        document.getElementById("next_btn").addEventListener("click", () => {
          const checked = Array.from(document.querySelectorAll('input[name="existing"]:checked')).map(i => i.value);
          const newLabels = splitClean(document.getElementById("new_labels").value);
          const combined = [...checked, ...newLabels].filter((v,i,a)=>a.indexOf(v)===i);

          if (REQUIRE_AT_LEAST_ONE_LABEL && combined.length === 0) {
            alert("Please select at least one category or add a new one.");
            return;
          }

          combined.forEach(lbl => { if (!labelBank.includes(lbl)) labelBank.push(lbl); });

          // Read selected memory checkbox (nullable)
          const memChecked = document.querySelector('input[name="mem"]:checked');
          const memory_rating = memChecked ? parseInt(memChecked.value, 10) : null;
          if (!memChecked) {
  alert("Please select a memory rating (1–7).");
  return;
}

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
            seed: seedParam || "",
            csv: csvParam
          });

          // --- Per-trial autosave (no headers with no-cors) ---
          if (APPS_SCRIPT_ENDPOINT && APPS_SCRIPT_ENDPOINT.startsWith("https")) {
            const trialPayload = {
              participant: pid,
              session: session,
              timestamp: new Date().toISOString(),
              record: jsPsych.data.get().last(1).values()[0]
            };
            fetch(APPS_SCRIPT_ENDPOINT, {
              method: "POST",
              mode: "no-cors",
              body: JSON.stringify(trialPayload)
            }).catch(e => console.error("Autosave failed", e));
          }

          jsPsych.finishTrial();
        });
      }
    });
  });

  // End
  timeline.push({
    type: HtmlButtonResponse,
    stimulus: `<div class="container"><h2>End</h2><p>Thanks for participating!</p></div>`,
    choices: ["Submit"]
  });

  jsPsych.run(timeline);
})();
