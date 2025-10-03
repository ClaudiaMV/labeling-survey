
// experiment.js
// Labeling Survey on jsPsych, hostable on GitHub Pages
// Features: 30 narrations randomized; participant-level label suggestions; free new labels; 1–7 memory rating; POST to Google Apps Script

const APPS_SCRIPT_ENDPOINT = "YOUR_APPS_SCRIPT_DEPLOYMENT_URL"; // <-- replace with your Web App URL

// Utility to fetch JSON
async function loadNarrations() {
  const res = await fetch('narrations.json', {cache: 'no-store'});
  if (!res.ok) throw new Error('Failed to load narrations.json');
  return await res.json();
}

// Shuffle helper
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// UI builders
function chipsHTML(bank) {
  if (!bank || bank.length === 0) return '<div class="small">No suggestions yet — your own labels will appear here on later items.</div>';
  return bank.map(lbl => {
    const esc = lbl.replace(/"/g, '&quot;');
    const id = 'chip_'+Math.random().toString(36).slice(2,8);
    return `<label class="label-chip"><input type="checkbox" name="existing" value="${esc}"> ${esc}</label>`;
  }).join('');
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
  </div>
  `;
}

function splitClean(s) {
  if (!s) return [];
  return s.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

(async function main(){
  // Participant prompt
  const pid = window.prompt("Participant ID (e.g., P01):", "");
  const session = "001";

  const narrations = await loadNarrations();
  // Enforce exactly 30; adjust if your file has more
  let items = narrations.slice(0);
  if (items.length < 30) {
    alert("narrations.json has fewer than 30 rows.");
  }
  items = shuffle(items).slice(0, 30);

  // Participant-level label bank
  const labelBank = []; // grows across trials

  // jsPsych init
  const jsPsych = initJsPsych({
    on_finish: async function(){
      // Prepare payload
      const payload = {
        participant: pid || "",
        session: session,
        timestamp: new Date().toISOString(),
        records: jsPsych.data.get().values(),  // array of all trial records
        final_label_bank: labelBank
      };

      // POST to Google Apps Script (if configured)
      if (APPS_SCRIPT_ENDPOINT && APPS_SCRIPT_ENDPOINT.startsWith("https")) {
        try {
          const resp = await fetch(APPS_SCRIPT_ENDPOINT, {
            method: "POST",
            mode: "no-cors", // Apps Script often requires no-cors
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          alert("Thanks! Your responses have been submitted.");
        } catch (e) {
          console.error(e);
          alert("Finished. Could not submit automatically. Please notify the researcher.");
        }
      } else {
        // Fallback: let the participant download a CSV locally
        jsPsych.data.get().localSave('csv', (pid || 'participant') + '_labeling.csv');
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
        <p>Task: For each narration, select any labels from your own growing suggestion list (it starts empty), and/or add new labels.</p>
        <p>Then rate how well you remember the video described (1–7).</p>
      </div>
    `,
    choices: ['Begin']
  });

  // For each narration, build a custom trial
  items.forEach((item, idx) => {
    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: function(){
        return `<div class="container">${trialHTML(item, labelBank)}</div>`;
      },
      on_load: function(){
        const btn = document.getElementById('next_btn');
        btn.addEventListener('click', () => {
          // Collect labels
          const checked = Array.from(document.querySelectorAll('input[name="existing"]:checked')).map(i => i.value);
          const newLabels = splitClean(document.getElementById('new_labels').value);
          const combined = [...checked, ...newLabels].filter((v, i, a) => a.indexOf(v) === i);

          if (combined.length === 0) {
            alert("Please select at least one label or add a new one.");
            return;
          }

          // Update participant-level bank
          combined.forEach(lbl => {
            if (!labelBank.includes(lbl)) labelBank.push(lbl);
          });

          const memory_rating = parseInt(document.getElementById('mem').value, 10);

          // Store this trial's data
          jsPsych.data.write({
            trial_index: idx+1,
            narration_id: item.narration_id,
            narration_text: item.narration_text,
            selected_labels: checked.join(','),
            new_labels: newLabels.join(','),
            all_labels: combined.join(','),
            memory_rating: memory_rating,
            label_bank_snapshot: labelBank.join(','),
            participant: pid || "",
            session: session
          });

          jsPsych.finishTrial();
        });
      }
    });
  });

  // Goodbye (data submission happens in on_finish)
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="container"><h2>End</h2><p>Thanks for participating!</p></div>`,
    choices: ['Submit']
  });

  jsPsych.run(timeline);
})();
