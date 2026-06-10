/* ── Variables ──────────────────────────────────────────────────────────── */
:root {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 16px;

  /* Dark mode (default) */
  --bg:          #000000;
  --bg2:         #1c1c1e;
  --bg3:         #2c2c2e;
  --bg4:         #3a3a3c;
  --accent:      #0a84ff;
  --danger:      #ff453a;
  --success:     #30d158;
  --warning:     #ffd60a;
  --text:        #ffffff;
  --text2:       rgba(235,235,245,.9);
  --text3:       #aeaeb2;
  --brand:       rgba(255,255,255,.55);
  --sep:         rgba(255,255,255,.10);
  --tab-bg:      rgba(28,28,30,.94);
  --card-radius: 20px;
  --btn-radius:  14px;
  --input-radius:12px;
}

/* ── Light mode ─────────────────────────────────────────────────────────── */
@media (prefers-color-scheme: light) {
  :root {
    --bg:     #f2f2f7;
    --bg2:    #ffffff;
    --bg3:    #e9e9ef;
    --bg4:    #d8d8e0;
    --accent: #007aff;
    --danger: #ff3b30;
    --success:#1e8a3a;
    --warning:#b35900;
    --text:   #000000;
    --text2:  #1c1c1e;
    --text3:  #4a4a52;
    --brand:  #6b6b72;
    --sep:    rgba(0,0,0,.12);
    --tab-bg: rgba(249,249,249,.96);
  }
}

/* ── Reset / Base ───────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  font-size: 15px;
}
a { color: inherit; text-decoration: none; }

/* ── Layout ─────────────────────────────────────────────────────────────── */
.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 12px 16px 96px;
}

/* ── Cards ──────────────────────────────────────────────────────────────── */
.card {
  background: var(--bg2);
  border: 1px solid var(--sep);
  border-radius: var(--card-radius);
  padding: 16px;
}
.grid2 { display: grid; grid-template-columns: 1fr; gap: 12px; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: var(--btn-radius);
  padding: 11px 18px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .15s;
}
.btn:active { opacity: .75; }
.btn:disabled { opacity: .4; cursor: default; }
.btn.secondary {
  background: var(--bg3);
  color: var(--text);
  border: none;
}
.btn.danger {
  background: var(--danger);
  color: #fff;
}

/* ── Forms ───────────────────────────────────────────────────────────────── */
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.row > * { min-width: 0; }
input[type="date"] { width: 100%; min-width: 0; -webkit-appearance: none; }

.input, select, textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--input-radius);
  border: 1px solid var(--sep);
  background: var(--bg3);
  color: var(--text);
  font-size: 16px;
  font-family: inherit;
  outline: none;
  transition: background .15s;
}
.input:focus, select:focus, textarea:focus { background: var(--bg4); }
select option { background: var(--bg3); color: var(--text); }

label {
  font-size: 13px;
  color: var(--text3);
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .3px;
}

/* ── Typography ──────────────────────────────────────────────────────────── */
h1 { margin: 8px 0 12px; font-size: 30px; font-weight: 700; letter-spacing: -.5px; color: var(--text); }
h2 { margin: 8px 0 10px; font-size: 22px; font-weight: 600; color: var(--text); }
h3 { margin: 6px 0 8px;  font-size: 18px; font-weight: 600; color: var(--text); }
.small { font-size: 13px; color: var(--text3); }
hr { border: 0; border-top: 1px solid var(--sep); margin: 14px 0; }
.kpi { font-size: 30px; font-weight: 700; color: var(--text); }
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--sep);
  font-size: 13px;
  font-weight: 500;
}

/* ── Tab bar iOS ─────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--tab-bg);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--sep);
  padding: 8px 0 max(env(safe-area-inset-bottom), 12px);
  z-index: 900;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  color: var(--text3);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: color .15s;
}
.tab-item.active { color: var(--accent); }
.tab-icon { font-size: 26px; line-height: 1.2; }

/* ── Nav desktop / mobile ────────────────────────────────────────────────── */
.nav-desktop { display: none !important; }
.nav-mobile  { display: flex !important; }

/* ── Catalog action buttons ──────────────────────────────────────────────── */
.catalog-actions { display: flex; gap: 6px; flex-shrink: 0; }
.catalog-actions .btn { padding: 6px 10px; font-size: 13px; border-radius: 10px; }

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 699px) {
  .row-form { flex-direction: column; }
  .row-form > * { width: 100% !important; flex: none !important; }
}
@media (min-width: 700px) {
  .grid2 { grid-template-columns: 1fr 1fr; }
  .nav-desktop { display: flex !important; }
  .nav-mobile  { display: none !important; }
  .tab-bar     { display: none !important; }
  .container   { padding: 16px; }
}

/* ── Animations ──────────────────────────────────────────────────────────── */
@keyframes cc-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
