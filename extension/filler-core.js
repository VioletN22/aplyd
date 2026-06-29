// aplyd - site-agnostic filling engine.
// Adapters (loaded alongside this file) describe each site; the core does the work:
// collect fields, resolve via the local bridge, ask-once, fill, agent card, logging.
// Everything stays ASSISTED - never auto-submits.
(() => {
  'use strict';
  if (window.__aplydCore) return;
  window.__aplydCore = true;
  const ADAPTERS = (window.AplydAdapters = window.AplydAdapters || []);
  const loggedUrls = new Set(); // dedup: log a given application URL once per page load

  // ---- bridge (via background service worker) ------------------------------
  function call(path, method, body) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'aplyd', path, method, body }, (resp) => {
        if (chrome.runtime.lastError || !resp) return resolve({ ok: false });
        resolve(resp);
      });
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- DOM helpers ---------------------------------------------------------
  // rect-based (offsetParent is null for position:fixed elements like LinkedIn's modal)
  const isVisible = (el) => {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  // normalize a captured label so the SAME question yields the SAME key across jobs:
  // drop required markers, collapse newlines/whitespace, trim trailing punctuation.
  function cleanLabel(s) {
    return (s || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\*/g, ' ')
      .replace(/\b(required|optional)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function labelFor(el) {
    let raw = '';
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.innerText.trim()) raw = l.innerText.trim();
    }
    if (!raw && el.getAttribute('aria-labelledby')) {
      const l = document.getElementById(el.getAttribute('aria-labelledby'));
      if (l && l.innerText.trim()) raw = l.innerText.trim();
    }
    if (!raw) {
      const grp = el.closest(
        '[data-test-form-element], .fb-dash-form-element, .jobs-easy-apply-form-element, ' +
        '.artdeco-text-input--container, .application-question, .field, fieldset, label, ' +
        '[class*="field"], [class*="question"]'
      );
      if (grp) {
        const l = grp.querySelector('label, legend, .label');
        if (l && l.innerText.trim()) raw = l.innerText.trim();
      }
    }
    if (!raw) raw = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
    return cleanLabel(raw);
  }
  // Full HTML escaper - safe in BOTH text and quoted-attribute contexts (escapes
  // &, <, >, " and '). Used for every interpolated page/profile/AI string.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // The text of a SINGLE choice option (a radio/checkbox), e.g. "Yes"/"No" - not
  // the group question. Prefer the option's own label over the group legend.
  function optionLabel(r) {
    if (r.id) { const l = document.querySelector(`label[for="${CSS.escape(r.id)}"]`); if (l && l.innerText.trim()) return cleanLabel(l.innerText); }
    const wrap = r.closest('label');
    if (wrap) { const c = wrap.cloneNode(true); c.querySelectorAll('input,select,textarea').forEach((n) => n.remove()); const s = c.innerText.trim(); if (s) return cleanLabel(s); }
    if (r.getAttribute('aria-label')) return cleanLabel(r.getAttribute('aria-label'));
    const sib = r.nextElementSibling;
    if (sib && sib.innerText && sib.innerText.trim().length <= 40) return cleanLabel(sib.innerText);
    if (r.value && r.value.trim()) return r.value.trim();
    return labelFor(r);
  }
  // The group question for a radio fieldset (its legend), not an option.
  function groupQuestion(fs, radios) {
    const leg = fs.querySelector('legend');
    if (leg && leg.innerText.trim()) return cleanLabel(leg.innerText);
    const q = labelFor(fs);
    if (q) return q;
    return radios && radios[0] ? labelFor(radios[0]) : '';
  }
  // Match a saved value to one of `labels` SAFELY: exact, then starts-with, then
  // whole-word. Never a raw substring - so "No" can't match "now" in a "Yes" option.
  function matchOption(labels, value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return -1;
    const norm = (l) => String(l || '').trim().toLowerCase();
    let i = labels.findIndex((l) => norm(l) === v);
    if (i >= 0) return i;
    i = labels.findIndex((l) => norm(l).replace(/^[^a-z0-9]+/i, '').startsWith(v));
    if (i >= 0) return i;
    const re = new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return labels.findIndex((l) => re.test(l));
  }

  // ---- field collection (works on any form root) ---------------------------
  function collectFields(root) {
    const out = [];
    const seen = new Set();
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!isVisible(el)) return;
      const type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'submit', 'button', 'search', 'password'].includes(type)) return;

      if (el.tagName === 'SELECT') {
        const options = [...el.options].map((o) => o.text.trim()).filter((t) => t && !/^(select|choose|please|pick)/i.test(t));
        out.push({ el, kind: 'select', label: labelFor(el), options });
      } else if (el.tagName === 'TEXTAREA') {
        out.push({ el, kind: 'textarea', label: labelFor(el), options: [] });
      } else if (type === 'radio') {
        const fs = el.closest('fieldset') || el.closest('[role="radiogroup"]') || el.closest('[data-test-form-element]') || el.closest('[class*="question"]');
        const key = fs || el;
        if (seen.has(key)) return; seen.add(key);
        const radios = [...(fs || root).querySelectorAll('input[type="radio"]')].filter(isVisible)
          .filter((r) => !fs || r.name === el.name);
        const options = radios.map(optionLabel).filter(Boolean);
        out.push({ el: fs || el, kind: 'radio', label: fs ? groupQuestion(fs, radios) : labelFor(el), options, radios });
      } else if (type === 'checkbox') {
        out.push({ el, kind: 'checkbox', label: labelFor(el), options: [] });
      } else if (type === 'file') {
        out.push({ el, kind: 'file', label: labelFor(el), options: [] });
      } else {
        out.push({ el, kind: 'text', label: labelFor(el), options: [] });
      }
    });
    return out;
  }

  function hasValue(f) {
    if (f.kind === 'radio') return (f.radios || []).some((r) => r.checked);
    if (f.kind === 'checkbox') return f.el.checked;
    if (f.kind === 'file') return f.el.files && f.el.files.length > 0;
    if (f.kind === 'select') {
      const v = (f.el.value || '').trim();
      if (!v || f.el.selectedIndex <= 0) return false;
      return !/^(select|choose|please|pick)/i.test(v);
    }
    return !!(f.el.value && f.el.value.trim());
  }

  // the option text currently selected on a choice field (to compare vs a saved answer)
  function currentChoice(f) {
    if (f.kind === 'select') { const o = f.el.options[f.el.selectedIndex]; return o ? o.text.trim() : ''; }
    if (f.kind === 'radio') { const r = (f.radios || []).find((x) => x.checked); return r ? optionLabel(r) : ''; }
    return (f.el.value || '').trim();
  }

  // fill a value; let the adapter handle custom widgets first
  function fillValue(f, value, adapter) {
    if (!value) return false;
    if (adapter && typeof adapter.fillWidget === 'function') {
      const handled = adapter.fillWidget(f, value, { setNativeValue });
      if (handled === true) return true;
      if (handled === false) return false;
      // undefined → fall through to core defaults
    }
    if (f.kind === 'select') {
      const opts = [...f.el.options];
      const idx = matchOption(opts.map((o) => o.text), value);
      if (idx >= 0) { f.el.value = opts[idx].value; f.el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }
    if (f.kind === 'radio') {
      const radios = f.radios || [];
      const idx = matchOption(radios.map(optionLabel), value);
      if (idx >= 0) { radios[idx].click(); return true; }
      return false;
    }
    setNativeValue(f.el, String(value));
    return true;
  }

  async function uploadDefaultDoc(f) {
    const { ok, data } = await call('/documents', 'GET');
    if (!ok || !data.documents || !data.documents.length) return false;
    const label = (f.label || '').toLowerCase();
    const want = label.includes('cover') ? 'cover-letter' : 'resume';
    const doc = data.documents.find((d) => d.isDefault && d.tags.includes(want))
      || data.documents.find((d) => d.tags.includes(want))
      || data.documents.find((d) => d.isDefault) || data.documents[0];
    if (!doc) return false;
    const res = await call('/document?id=' + encodeURIComponent(doc.id), 'GET');
    if (!res.ok || !res.data.base64) return false;
    const bytes = Uint8Array.from(atob(res.data.base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], res.data.fileName || 'document.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer(); dt.items.add(file);
    f.el.files = dt.files;
    f.el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ---- ask-once popup (with option buttons for choices) --------------------
  function askUser(label, hint, options) {
    return new Promise((resolve) => {
      const opts = (options || []).filter(Boolean);
      const wrap = document.createElement('div');
      wrap.className = 'aplyd-ask-overlay';
      wrap.innerHTML = `
        <div class="aplyd-ask-card">
          <div class="aplyd-ask-brand">aplyd</div>
          <div class="aplyd-ask-q">${escapeHtml(label || 'This field')}</div>
          ${hint ? `<div class="aplyd-ask-hint">${escapeHtml(hint)}</div>` : ''}
          ${opts.length
            ? `<div class="aplyd-ask-choices">${opts.map((o, i) => `<button class="aplyd-ask-choice" data-i="${i}">${escapeHtml(o)}</button>`).join('')}</div>`
            : `<input class="aplyd-ask-input" type="text" placeholder="Your answer" autofocus />`}
          <label class="aplyd-ask-remember"><input type="checkbox" checked /> Remember my answer for this question</label>
          <div class="aplyd-ask-row">
            <button class="aplyd-ask-skip">Skip</button>
            ${opts.length ? '' : '<button class="aplyd-ask-save">Save &amp; continue</button>'}
          </div>
        </div>`;
      document.body.appendChild(wrap);

      // Shield our popup from the host page's focus trap (LinkedIn's modal yanks
      // focus back into itself, so typing never reaches our input). Intercept
      // focus/keyboard events for our elements at the window-capture phase, before
      // the page's handlers can act on them.
      const guard = (e) => { if (wrap.contains(e.target)) e.stopPropagation(); };
      const GUARDED = ['focusin', 'focusout', 'keydown', 'keyup', 'keypress'];
      GUARDED.forEach((t) => window.addEventListener(t, guard, true));

      // The host's modal has its own focus trap that yanks focus back into itself,
      // so typing never reaches our input. Invert it: whenever focus lands OUTSIDE
      // our popup, pull it straight back. Our popup becomes the focus owner, so the
      // input is typeable immediately instead of going dead for a moment.
      const field = () => wrap.querySelector('.aplyd-ask-input') || wrap.querySelector('.aplyd-ask-choice') || wrap.querySelector('.aplyd-ask-skip');
      const recapture = (e) => {
        if (!document.body.contains(wrap)) return;
        if (!wrap.contains(e.target)) { const f = field(); if (f) f.focus(); }
      };
      document.addEventListener('focusin', recapture, true);

      const remember = wrap.querySelector('.aplyd-ask-remember input');
      const done = (val) => {
        GUARDED.forEach((t) => window.removeEventListener(t, guard, true));
        document.removeEventListener('focusin', recapture, true);
        wrap.remove();
        resolve(val);
      };
      wrap.querySelector('.aplyd-ask-skip').onclick = () => done(null);
      if (opts.length) {
        wrap.querySelectorAll('.aplyd-ask-choice').forEach((b) => {
          b.onclick = () => done({ value: opts[Number(b.dataset.i)], remember: remember.checked });
        });
      } else {
        const input = wrap.querySelector('.aplyd-ask-input');
        wrap.querySelector('.aplyd-ask-save').onclick = () => done({ value: input.value.trim(), remember: remember.checked });
        input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); wrap.querySelector('.aplyd-ask-save').click(); } };
        // focus after the host's own focus handling settles
        setTimeout(() => input.focus(), 60);
        setTimeout(() => input.focus(), 250);
      }
    });
  }

  // ---- agent card ----------------------------------------------------------
  let agentEl, statusTextEl, metaEl, ctaEl, currentAdapter = null, running = false, cancelled = false;
  function ensureAgent() {
    if (document.getElementById('aplyd-agent')) return;
    const markUrl = chrome.runtime.getURL('icons/icon-128.png');
    const card = document.createElement('div');
    card.id = 'aplyd-agent';
    card.className = 'idle';
    card.innerHTML = `
      <div class="aplyd-head">
        <div class="aplyd-mark"><img src="${markUrl}" alt="aplyd" /></div>
        <div class="aplyd-titles">
          <div class="aplyd-name">aplyd</div>
          <div class="aplyd-sub">Easy Apply assistant</div>
        </div>
        <div class="aplyd-conn" title="Connected to aplyd"></div>
        <button class="aplyd-min" title="Minimise" aria-label="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="aplyd-body">
        <span class="aplyd-spin"></span>
        <div class="aplyd-lines">
          <div class="aplyd-status-text">Ready when you are</div>
          <div class="aplyd-meta"></div>
        </div>
      </div>
      <div class="aplyd-actions">
        <button class="aplyd-cta">Autofill this application</button>
        <button class="aplyd-stop">Stop</button>
      </div>
      <img class="aplyd-mini" src="${markUrl}" alt="aplyd" title="Open aplyd" />`;
    document.body.appendChild(card);
    agentEl = card;
    statusTextEl = card.querySelector('.aplyd-status-text');
    metaEl = card.querySelector('.aplyd-meta');
    ctaEl = card.querySelector('.aplyd-cta');
    ctaEl.onclick = () => runActive();
    card.querySelector('.aplyd-stop').onclick = () => { cancelled = true; setStatus('Stopping…'); };
    card.querySelector('.aplyd-min').onclick = (e) => { e.stopPropagation(); card.classList.add('collapsed'); };
    card.addEventListener('click', () => { if (card.classList.contains('collapsed')) card.classList.remove('collapsed'); });
    applyAdapterChrome();
  }
  function applyAdapterChrome() {
    if (!agentEl || !currentAdapter) return;
    agentEl.querySelector('.aplyd-sub').textContent = currentAdapter.subtitle || 'Application assistant';
    ctaEl.textContent = currentAdapter.autoAdvance ? 'Autofill this application' : 'Fill this page';
  }
  function setMeta(text) { if (metaEl) metaEl.textContent = text || ''; }
  function setStatus(text, err, ok) {
    ensureAgent();
    if (!agentEl) return;
    statusTextEl.textContent = text;
    agentEl.className = err ? 'error' : ok ? 'ready' : running ? 'running' : 'idle';
  }

  // ---- the run loop (adapter-driven) ---------------------------------------
  async function logOnce(ctx) {
    const key = ctx.jobUrl || location.href;
    if (loggedUrls.has(key)) return;
    loggedUrls.add(key);
    await call('/log', 'POST', { company: ctx.company, jobTitle: ctx.title, jobUrl: ctx.jobUrl });
  }

  async function runFill(adapter) {
    if (running) return;
    running = true; cancelled = false; currentAdapter = adapter;
    applyAdapterChrome();
    let filled = 0;
    setStatus('Starting…'); setMeta('');
    try {
      let root = adapter.getFormRoot();
      if (!root && adapter.openForm) {
        setStatus('Opening application…');
        const r = await adapter.openForm();
        if (r === 'external') {
          setStatus('Opening the application in a new tab - I’ll keep going there.', false, true);
          running = false; return;
        }
      }
      // poll for the form (modal still opening, or a late-rendering ATS page)
      for (let i = 0; i < 18 && !root; i++) { await sleep(400); root = adapter.getFormRoot(); }
      if (!root) { setStatus('No application form found - open the form, then retry.', true); running = false; return; }

      const ctx = await resolveContext(adapter);
      const tick = () => setMeta(`${filled} field${filled === 1 ? '' : 's'} filled`);
      const maxSteps = adapter.autoAdvance ? 10 : 1;
      let logged = false;

      for (let step = 0; step < maxSteps; step++) {
        if (cancelled) { setStatus('Stopped.', false, true); break; }
        root = adapter.getFormRoot();
        if (!root) break;
        setStatus(maxSteps > 1 ? `Reading step ${step + 1}…` : 'Reading the form…');
        const fields = collectFields(root);

        for (const f of fields) {
          if (cancelled) break;
          if (!f.label) continue;
          if (hasValue(f)) {
            // already filled (often a stale prefill, e.g. LinkedIn remembering an old
            // answer). For dropdown/radio questions we have a SAVED answer for, correct
            // it to yours if it differs. Other prefills (email, etc.) are left alone.
            if (f.kind === 'select' || f.kind === 'radio') {
              const { ok, data } = await call('/resolve', 'POST', { label: f.label, type: f.kind, options: f.options, cacheOnly: true });
              if (ok && data.action === 'fill' && data.value && currentChoice(f).toLowerCase() !== String(data.value).toLowerCase()) {
                setStatus(`Correcting “${f.label.slice(0, 40)}”`);
                fillValue(f, data.value, adapter);
              }
            }
            continue;
          }
          setStatus(`Filling “${(f.label || f.kind).slice(0, 46)}”`);

          if (f.kind === 'file') { if (await uploadDefaultDoc(f)) { filled++; tick(); } continue; }
          if (f.kind === 'checkbox') {
            // Legal attestations are surfaced for EXPLICIT user confirmation - we never
            // silently auto-tick them. "certify" is intentionally excluded entirely: a
            // false certification is the user's to make, not the engine's.
            if (/\bcertify\b/i.test(f.label)) {
              setStatus('Attestation - your call…');
              const a = await askUser(f.label, 'Legal attestation - tick only if true', ['Yes, tick this', 'No, leave it']);
              if (a && a.value === 'Yes, tick this' && !f.el.checked) { f.el.click(); filled++; tick(); }
              continue;
            }
            if (/agree|terms|consent|privacy/i.test(f.label)) {
              setStatus('Attestation - your call…');
              const a = await askUser(f.label, 'Please confirm before I tick this', ['Yes, tick this', 'No, leave it']);
              if (a && a.value === 'Yes, tick this' && !f.el.checked) { f.el.click(); filled++; tick(); }
            }
            continue;
          }
          if (f.kind === 'textarea') {
            // cover letters open the interactive studio instead of a silent autofill
            if (/cover letter|covering letter|cover note/i.test(f.label) && window.Aplyd.openCoverStudio) {
              setStatus('Cover letter - opening the studio…');
              const used = await window.Aplyd.openCoverStudio({ field: f, ctx });
              if (used) { filled++; tick(); }
              continue;
            }
            const { ok, data } = await call('/tailor', 'POST', { question: f.label, jobText: ctx.jobText });
            if (ok && data.answer) { fillValue(f, data.answer, adapter); filled++; tick(); }
            else { setStatus('Waiting on you…'); const a = await askUser(f.label, 'Open-ended - write your answer'); if (a && a.value) { fillValue(f, a.value, adapter); filled++; tick(); } }
            continue;
          }
          const isChoice = f.kind === 'select' || f.kind === 'radio';
          const { ok, data } = await call('/resolve', 'POST', { label: f.label, type: f.kind, options: f.options });
          if (ok && data.action === 'fill' && fillValue(f, data.value, adapter)) { filled++; tick(); continue; }
          setStatus('Waiting on you…');
          const ans = await askUser(f.label, data && data.hint, isChoice ? f.options : null);
          if (ans && ans.value) {
            const ok2 = fillValue(f, ans.value, adapter);
            if (ok2) { filled++; tick(); }
            if (ans.remember && ok2) await call('/answer', 'POST', { label: f.label, value: ans.value, fieldKey: f.label, patterns: [f.label] });
          }
        }
        if (cancelled) { setStatus('Stopped.', false, true); break; }

        // log the application (deduped) once we've actually filled something
        if (!logged && filled > 0) { await logOnce(ctx); logged = true; }

        if (!adapter.autoAdvance) {
          setStatus('Filled this page - review, then click Next/Submit yourself.', false, true);
          break;
        }
        await sleep(400);
        const { submit, review, next } = adapter.footerButtons(root) || {};
        // INVARIANT: we only ever advance INTERMEDIATE steps; the human submits.
        // We NEVER programmatically .click() a submit/done/terminal button.
        if (submit) {
          // passive listener only - so we can log when the USER submits. No .click().
          submit.addEventListener('click', () => logOnce(ctx), { once: true });
          setStatus('Review, then hit Submit yourself.', false, true);
          break;
        }
        // Structural last-step guard: if the site exposes step progress and this is
        // the final step, STOP and hand off - never auto-click a terminal button
        // that might submit (e.g. a "Continue"/"Review" labelled final action).
        const prog = adapter.stepProgress ? adapter.stepProgress(root) : null;
        const isLastStep = prog && prog.total > 0 && prog.current >= prog.total;
        if (isLastStep) {
          setStatus('Last step - review, then submit yourself.', false, true);
          break;
        }
        const advance = review || next;
        if (advance) {
          // Guard the label one more time: never click anything that reads like a
          // final/submit action, even if an adapter's matcher let it through.
          const adv = (advance.getAttribute('aria-label') || advance.innerText || '').trim();
          if (/\b(submit|done|apply|finish)\b/i.test(adv)) {
            setStatus('Looks like the final step - review, then submit yourself.', false, true);
            break;
          }
          advance.click();
          await sleep(1200);
          // Re-scan after the DOM settles: if a Submit-type button is now present,
          // we've reached the final step - STOP rather than loop further.
          const after = adapter.footerButtons(adapter.getFormRoot() || root) || {};
          if (after.submit) {
            after.submit.addEventListener('click', () => logOnce(ctx), { once: true });
            setStatus('Review, then hit Submit yourself.', false, true);
            break;
          }
          continue;
        }
        setStatus('Filled what I could - finish the rest by hand.', false, true);
        break;
      }
    } catch (e) {
      setStatus('Error: ' + (e && e.message ? e.message : e), true);
    }
    running = false;
  }

  // company/title/jobText: prefer the adapter's page parse, fall back to the stashed
  // LinkedIn job (when arriving via an external Apply link).
  async function resolveContext(adapter) {
    let ctx = {};
    try { ctx = adapter.jobContext ? adapter.jobContext() : {}; } catch { ctx = {}; }
    if (!ctx.company || !ctx.title) {
      const { ok, data } = await call('/pending-job', 'GET');
      if (ok && data && data.job) {
        ctx.company = ctx.company || data.job.company;
        ctx.title = ctx.title || data.job.title;
        ctx.jobText = ctx.jobText || data.job.jobText;
      }
    }
    ctx.company = ctx.company || 'Unknown';
    ctx.title = ctx.title || 'Role';
    ctx.jobUrl = ctx.jobUrl || location.href.split('?')[0];
    return ctx;
  }

  // ---- bootstrap helpers (used by content.js) ------------------------------
  function pickAdapter(url) {
    return ADAPTERS.find((a) => { try { return a.matches(url); } catch { return false; } }) || null;
  }
  function setAdapter(a) { currentAdapter = a; if (agentEl) applyAdapterChrome(); }
  function runActive() { if (currentAdapter) runFill(currentAdapter); }
  function runGeneric() {
    const g = ADAPTERS.find((a) => a.id === 'generic');
    if (g) { setAdapter(g); runFill(g); }
  }

  // Hosts we trust to consume the cross-tab `autorun` handoff automatically. Kept in
  // sync with manifest.json content_scripts.matches. On ANY other origin (including
  // anything the catch-all generic adapter would match), the user must click Autofill
  // manually - we never auto-run on an unknown destination origin.
  const AUTORUN_HOSTS = [
    /(^|\.)linkedin\.com$/i,
    /(^|\.)greenhouse\.io$/i,
    /(^|\.)lever\.co$/i,
    /(^|\.)myworkdayjobs\.com$/i,
    /(^|\.)ashbyhq\.com$/i,
  ];
  function isAutorunHost() {
    const h = location.hostname || '';
    return AUTORUN_HOSTS.some((re) => re.test(h));
  }

  // On an external ATS tab opened from a LinkedIn Apply, the stash carries an
  // `autorun` flag - consume it once and continue the flow automatically.
  let autorunChecked = false;
  async function maybeAutorun(adapter) {
    if (autorunChecked || !adapter || adapter.id === 'linkedin') return;
    // Only honour the handoff on a KNOWN supported ATS host. The generic adapter
    // matches everything, so guard by origin too - never auto-run on an unknown site.
    if (adapter.id === 'generic' || !isAutorunHost()) { autorunChecked = true; return; }
    autorunChecked = true;
    const { ok, data } = await call('/pending-job', 'GET');
    if (ok && data && data.job && data.job.autorun) {
      await call('/pending-job', 'POST', { job: { ...data.job, autorun: false } }); // consume it
      ensureAgent();
      setAdapter(adapter);
      runFill(adapter);
    }
  }

  window.Aplyd = {
    call, sleep, isVisible, labelFor, setNativeValue, collectFields,
    ensureAgent, setStatus, setMeta, runFill, pickAdapter, setAdapter, runActive, runGeneric, maybeAutorun,
  };
})();
