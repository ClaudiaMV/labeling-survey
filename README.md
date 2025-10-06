# 🧠 Labeling Survey – Setup and Deployment Guide

This repository contains the full code for the **Labeling Survey**, an online experiment that collects crowd-sourced *categories* (labels) describing narrated videos.  
The project uses **jsPsych v7** for stimulus presentation and **Google Apps Script** for cloud data storage, all hosted through **GitHub Pages**.

---

## ⚙️ 1. Project Overview

Participants read short *narrations* describing videos and identify **broad categories** that capture what types of information each narration contains (e.g., *Location*, *Action*, *Agent*, *Emotion*).

The experiment:
- Loads narration texts from a `.csv` file.
- Presents them in random or seeded order.
- Records user-created categories and a memory rating.
- Automatically uploads responses to a linked Google Sheet via Apps Script.

---

## 📂 2. Repository Structure

```
labeling-survey/
│
├── index.html                # Main entry page (loads jsPsych + experiment)
├── experiment.js             # Core experiment logic and data handling
├── styles.css                # Optional styling (optional)
│
├── data/                     # Contains all narration sets (selectable versions)
│   ├── narrations_v1.csv
│   ├── narrations_v2.csv
│   ├── narrations_v3.csv
│   └── narrations_v4.csv
│
└── README.md                 # Setup guide (this file)
```

---

## 🧩 3. Prerequisites

You only need:
- A **GitHub account**
- A **Google account**
- Your narrations stored as CSV files (comma-separated, UTF-8 encoded)

No installation is required beyond your browser.

---

## 🌐 4. Hosting on GitHub Pages

### Step 1: Clone or create your repository
1. On GitHub, create a repository named **`labeling-survey`**.  
2. Upload the following files:
   - `index.html`
   - `experiment.js`
   - `data/narrations_v1.csv` (and other versions if applicable)

Your repository structure should look like this:

```
labeling-survey/
├── index.html
├── experiment.js
└── data/
    ├── narrations_v1.csv
    ├── narrations_v2.csv
```

### Step 2: Enable GitHub Pages
1. Go to your repository **Settings → Pages**  
2. Under **Source**, select:  
   `Deploy from a branch` → `main` → `/ (root)`
3. Click **Save**
4. After a minute, your site will be live at:
   ```
   https://<your-username>.github.io/labeling-survey/
   ```

### Step 3: Check your CSV loading
Your default dataset is defined in `experiment.js`:
```js
const csvParam = qs.get("csv") || "data/narrations_v1.csv";
```

To test it:
- Visit the link:  
  `https://<your-username>.github.io/labeling-survey/`
- Open the browser console (`Ctrl+Shift+J` or `⌥⌘J` on Mac).
- Verify that your CSV loads successfully (no 404 errors).

---

## 📊 5. Connecting to Google Sheets (Data Storage)

### Step 1: Create a new Google Sheet
1. Go to [https://sheets.google.com](https://sheets.google.com)
2. Create a blank sheet.
3. Name it something like **LabelingSurvey_Responses**.

### Step 2: Open the Script Editor
1. In the sheet, go to **Extensions → Apps Script**.
2. Delete any sample code.
3. Paste in this full script:

```javascript
const SHEET_ID = 'YOUR_SHEET_ID_HERE'; // From your Sheet URL
const SHEET_NAME = 'Responses';

function doPost(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const now = new Date();

  try {
    const data = JSON.parse(e.postData.contents);
    const records = data.records || [data.record];
    records.forEach(rec => {
      const row = [
        now.toISOString(),
        data.participant || "",
        data.session || "",
        rec.narration_id || "",
        rec.narration_text || "",
        rec.selected_labels || "",
        rec.new_labels || "",
        rec.all_labels || "",
        rec.memory_rating || "",
        rec.label_bank_snapshot || "",
        data.csv || "",
        data.seed || "",
      ];
      sh.appendRow(row);
    });
  } catch (err) {
    sh.appendRow(["ERROR", now.toISOString(), err.toString()]);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }));
}
```

### Step 3: Deploy as a Web App
1. Click **Deploy → New deployment**
2. Select **Web app**
3. Set:
   - **Execute as:** *Me (your account)*
   - **Who has access:** *Anyone with the link*
4. Click **Deploy**
5. Copy the **Web app URL** — it will look like:

```
https://script.google.com/macros/s/AKfycbxYourScriptID/exec
```

### Step 4: Paste it into `experiment.js`
At the top of your file, replace the placeholder line with your link:

```js
const APPS_SCRIPT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxYourScriptID/exec";
```

Save, commit, and push to GitHub.  
Now all participant responses will be sent to your Google Sheet automatically.

---

## 🧠 6. Data Saving Logic

The experiment sends data twice:
1. **Per trial (autosave)** — immediately after each “Next” click.  
2. **At the end (final upload)** — when the participant finishes.

If internet access fails, jsPsych automatically triggers a **local CSV download** as backup.

---

## 🧪 7. Testing

Before distributing the link:
1. Open your hosted survey in a browser.
2. Run it with a test ID:
   ```
   https://<username>.github.io/labeling-survey/?pid=test01&n=3
   ```
3. After completing a few narrations, check your Google Sheet.
   - You should see a new row under **Responses**.
   - The first column shows a timestamp.
   - Each row represents one narration trial.

---

## 🎨 8. Customizing

| Feature | How to Modify |
|----------|----------------|
| **Instructions** | Edit the `INSTRUCTIONS_HTML` constant in `experiment.js`. |
| **Default CSV file** | Change `const csvParam = ...` at the top. |
| **Memory question type** | Currently uses single-choice checkboxes (1–7). You can change wording in `trialHTML()`. |
| **Data destination** | Replace `APPS_SCRIPT_ENDPOINT` with another Google Script URL or disable uploads to save locally. |

---

## 🧭 9. Managing Multiple Versions

If you have multiple narration sets:
- Store them inside `/data/` as `narrations_v1.csv`, `narrations_v2.csv`, etc.
- Load them using a URL parameter:

```
https://<username>.github.io/labeling-survey/?csv=data/narrations_v2.csv
```

You can also combine parameters:
```
https://<username>.github.io/labeling-survey/?csv=data/narrations_v3.csv&n=30&pid=P05
```

---

## 💡 10. Troubleshooting

| Issue | Cause | Fix |
|--------|--------|-----|
| CSV not loading | Wrong file path or filename | Check in browser console; correct `csvParam` or folder structure |
| Data not reaching Sheet | Script not deployed or restricted access | Redeploy Web App as “Anyone with the link” |
| No new rows in Sheet | Headers in row 1 are malformed | Delete header row; the script will auto-create one |
| Old version showing | Browser cache | Hard refresh (`Cmd+Shift+R`) or add `?v=20251006` to URL |

---

## 🧾 11. Credits

Developed by **Dr. Claudia Morales Valiente**  
Postdoctoral Researcher | Memory of Events Lab | University of Alberta  

Built with:
- [jsPsych 7.3.3](https://www.jspsych.org/)
- [Google Apps Script](https://developers.google.com/apps-script)
- Hosted via [GitHub Pages](https://pages.github.com/)
