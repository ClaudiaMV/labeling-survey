// experiment.js  (CSV version)
// Labeling Survey on jsPsych (hostable on GitHub Pages)
// - Loads narrations from narrations.csv (two columns: narration_id,narration_text)
// - 30 narrations randomized per participant
// - Participant-level label suggestions that grow across trials
// - New labels (comma-separated) + selectable prior labels
// - 1–7 memory rating slider
// - Saves to Google Sheets via Apps Script (if configured) OR downloads CSV locally

// ========================= CONFIG =========================
const APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbypuBymSX2YQlOyokXJTddDp347fLhT59IwIAmeCUHR0Oc-2x_ZRTZhiZPiBE5t8-o7/exec"; // <-- paste your Google Apps Script Web App URL or leave blank to download CSV
const N_TRIALS = 30; // enforce exactly 30 narrations per participant
const REQUIRE_AT_LEAST_ONE_LABEL = true; // set to false to allow empty label entries
// ==========================================================

// ------- Minimal CSV parser supporting quotes & commas -------
function parseCSV(text) {
  // Normalizes newlines and parses a simple CSV with quoted fields
  // Returns an array of objects based on header row
  const rows = [];
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let i = 0, field = "", row = [];
  let inQuotes = false;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    rows.push(row);
    row = [];
  }

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      } else {
        field += c; i++; continue;
      }
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { endField(); i++; continue; }
      if (c === "\n") { endField(); endRow(); i++; continue; }
      field += c; i++; continue;
    }
  }
  // flush last field/row
  endField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) endRow();

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

// ------- Load narrations from CSV in repo root -------
async function loadNarrationsCSV() {
  const res = await fetch("narrations.csv", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load narrations.csv");
  const text = await res.text();
  const arr = parseCSV(text);
  // Expect headers: narration_id,narration_text
  return arr.filter(x => x.narration_id && x.narration_text);
}

// ------- Utilities -------
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
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

// ------- Main -------
(async function main() {
  // Get participant ID (use query string ?pid=P01 if you like)
  const urlParams = new URLSearchParams(window.location.search);
  const pidQS = urlParams.get("pid") || "";
  const pid = pidQS || window.prompt("Participant ID (e.g., P01):", "") || "";
  const session = "001";

  // Load & choose narrations
  const narrations = await loadNarrationsCSV();
  if (narrations.length < N_TRIALS) {
    alert(`narrations.csv has only ${narrations.length} rows; ${N_TRIALS} required.`);
  }
  const items = shuffle(narrations).slice(0, N_TRIALS);

  // Participant-level label bank (suggestions)
  const labelBank = [];

  // Init jsPsych
  const jsPsych = initJsPsych({
    on_finish: async function () {
      const payload = {
        participant: pid,
        session: session,
        timestamp: new Date().toISOString(),
        records: jsPsych.data.get().values(),
        final_label_bank: labelBank
      };

      // Try posting to Google Apps Script
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
        // Fallback: local CSV download
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
      stimulus: function () {
        return `<div class="container">${trialHTML(item, labelBank)}</div>`;
      },
      on_load: function () {
        const btn = document.getElementById("next_btn");
        btn.addEventListener("click", () => {
          const checked = Array.from(document.querySelectorAll('input[name="existing"]:checked')).map(i => i.value);
          const newLabels = splitClean(document.getElementById("new_labels").value);
          const combined = [...checked, ...newLabels].filter((v, i, a) => a.indexOf(v) === i);

          if (REQUIRE_AT_LEAST_ONE_LABEL && combined.length === 0) {
            alert("Please select at least one label or add a new one.");
            return;
          }

          // Update participant-level bank
          combined.forEach(lbl => {
            if (!labelBank.includes(lbl)) labelBank.push(lbl);
          });

          const memory_rating = parseInt(document.getElementById("mem").value, 10);

          // Store trial row
          jsPsych.data.write({
            trial_index: idx + 1,
            narration_id: item.narration_id,
            narration_text: item.narration_text,
            selected_labels: checked.join(","),
            new_labels: newLabels.join(","),
            all_labels: combined.join(","),
            memory_rating: memory_rating,
            label_bank_snapshot: labelBank.join(","),
            participant: pid,
            session: session
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

