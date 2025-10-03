
Labeling Survey (jsPsych, GitHub Pages)

Deploy steps:
1) Create a new GitHub repo (e.g., labeling-survey) and upload: index.html, experiment.js, narrations.json, styles.css.
2) In GitHub: Settings → Pages → Build and deployment → Source: Deploy from a branch; Branch: main; Folder: /(root). Save.
3) Wait 1–2 minutes. Your link becomes: https://<your-username>.github.io/labeling-survey/
4) To collect data automatically, create a Google Apps Script Web App receiver (instructions inside experiment.js header comment / README) and paste its URL into APPS_SCRIPT_ENDPOINT.
