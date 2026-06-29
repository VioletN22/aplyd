// aplyd - Cover-letter studio. Opens a drafting panel when an application
// asks for a cover letter: Claude drafts it with full context (resume + portfolio +
// facts + voice), you refine step by step, and only the sentences that change animate
// in place (red out, green in) so you see exactly what it did. Save as PDF or drop it
// into the application field.
(() => {
  'use strict';
  const A = window.Aplyd;
  if (!A) return;

  // ---- sentence diff helpers ----------------------------------------------
  function sentencesOf(para) {
    const m = para.match(/[^.!?]*[.!?]+|\S[^.!?]*$/g);
    return (m || [para]).map((s) => s.trim()).filter(Boolean);
  }
  function splitSentences(text) {
    const out = [];
    (text || '').split(/\n{2,}/).forEach((p, pi) => {
      sentencesOf(p.trim()).forEach((t) => out.push({ text: t, para: pi }));
    });
    return out;
  }
  // longest-common-subsequence pairing of two sentence arrays (by text)
  function lcsPairs(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const pairs = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    return pairs;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function makeSentSpan(text, cls) {
    const s = document.createElement('span');
    s.className = 'aplyd-cl-sent' + (cls ? ' ' + cls : '');
    s.dataset.text = text;
    s.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>') + ' ';
    return s;
  }
  // build paragraph blocks from a sentence list, reusing provided spans where given
  function buildParas(sents, spanFor) {
    const frag = document.createDocumentFragment();
    let curPara = -1, paraEl = null;
    sents.forEach((s, idx) => {
      if (s.para !== curPara) { curPara = s.para; paraEl = document.createElement('div'); paraEl.className = 'aplyd-cl-para'; frag.appendChild(paraEl); }
      paraEl.appendChild(spanFor(idx));
    });
    return frag;
  }

  // first render
  function renderInitial(container, text) {
    const sents = splitSentences(text);
    container.innerHTML = '';
    container.appendChild(buildParas(sents, (i) => makeSentSpan(sents[i].text)));
    return sents;
  }

  // animate from old text to new text: removed sentences flash red then vanish,
  // kept sentences stay (moved, not re-typed), added sentences fade in green.
  async function applyDiff(container, oldSents, newText) {
    const newSents = splitSentences(newText);
    const pairs = lcsPairs(oldSents.map((s) => s.text), newSents.map((s) => s.text));
    const keptOld = new Map(); // oldIdx -> newIdx
    const keptNew = new Map(); // newIdx -> oldIdx
    pairs.forEach(([oi, ni]) => { keptOld.set(oi, ni); keptNew.set(ni, oi); });

    const oldSpans = [...container.querySelectorAll('.aplyd-cl-sent')];

    // 1) flag removed sentences
    let removed = 0;
    oldSpans.forEach((sp, oi) => { if (!keptOld.has(oi)) { sp.classList.add('aplyd-cl-removing'); removed++; } });
    if (removed) await sleep(750);

    // 2) rebuild in new order: reuse kept spans (no re-type), create added spans green
    const spanFor = (ni) => {
      if (keptNew.has(ni)) { const sp = oldSpans[keptNew.get(ni)]; sp.classList.remove('aplyd-cl-removing'); return sp; }
      return makeSentSpan(newSents[ni].text, 'aplyd-cl-adding');
    };
    container.innerHTML = '';
    container.appendChild(buildParas(newSents, spanFor));

    // 3) settle the green highlight
    await sleep(60);
    container.querySelectorAll('.aplyd-cl-adding').forEach((sp) => sp.classList.add('aplyd-cl-settle'));
    setTimeout(() => container.querySelectorAll('.aplyd-cl-sent').forEach((sp) => sp.classList.remove('aplyd-cl-adding', 'aplyd-cl-settle')), 1600);
    return newSents;
  }

  // ---- the studio ----------------------------------------------------------
  function openCoverStudio({ field, ctx }) {
    return new Promise((resolve) => {
      const company = ctx.company || 'the company';
      const role = ctx.title || 'this role';
      let current = '';
      let sents = [];

      const wrap = document.createElement('div');
      wrap.className = 'aplyd-cl-overlay';
      wrap.innerHTML = `
        <div class="aplyd-cl-card">
          <div class="aplyd-cl-head">
            <div class="aplyd-cl-brand"><img alt="aplyd"/> Cover letter <span>· ${escapeHtml(role)} @ ${escapeHtml(company)}</span></div>
            <button class="aplyd-cl-x" title="Close">&times;</button>
          </div>
          <div class="aplyd-cl-body"><div class="aplyd-cl-loading"><span class="aplyd-cl-spin"></span> Drafting with your resume + portfolio…</div></div>
          <div class="aplyd-cl-questions"></div>
          <div class="aplyd-cl-refine">
            <input class="aplyd-cl-input" type="text" placeholder="Tell me what to change… e.g. “cut the 3rd paragraph”, “mention my volleyball app”, “less formal”" disabled />
            <button class="aplyd-cl-send" disabled>Refine</button>
          </div>
          <div class="aplyd-cl-foot">
            <label class="aplyd-cl-remember"><input type="checkbox" checked /> Remember my style feedback</label>
            <div class="aplyd-cl-actions">
              <button class="aplyd-cl-cancel">Cancel</button>
              <button class="aplyd-cl-save" disabled>Save PDF</button>
              <button class="aplyd-cl-use" disabled>Use this letter</button>
            </div>
          </div>
          <div class="aplyd-cl-toast"></div>
        </div>`;
      document.body.appendChild(wrap);
      try { wrap.querySelector('.aplyd-cl-brand img').src = chrome.runtime.getURL('icons/icon-128.png'); } catch (e) { /* ignore */ }

      // shield from the host page's focus trap so the inputs are typeable
      const guard = (e) => { if (wrap.contains(e.target)) e.stopPropagation(); };
      const GUARDED = ['focusin', 'focusout', 'keydown', 'keyup', 'keypress'];
      GUARDED.forEach((t) => window.addEventListener(t, guard, true));

      const body = wrap.querySelector('.aplyd-cl-body');
      const qWrap = wrap.querySelector('.aplyd-cl-questions');
      const input = wrap.querySelector('.aplyd-cl-input');
      const sendBtn = wrap.querySelector('.aplyd-cl-send');
      const saveBtn = wrap.querySelector('.aplyd-cl-save');
      const useBtn = wrap.querySelector('.aplyd-cl-use');
      const remember = wrap.querySelector('.aplyd-cl-remember input');
      const toast = wrap.querySelector('.aplyd-cl-toast');

      const finish = (used) => { GUARDED.forEach((t) => window.removeEventListener(t, guard, true)); wrap.remove(); resolve(used); };
      wrap.querySelector('.aplyd-cl-x').onclick = () => finish(false);
      wrap.querySelector('.aplyd-cl-cancel').onclick = () => finish(false);

      const setReady = (on) => { [input, sendBtn, saveBtn, useBtn].forEach((b) => (b.disabled = !on)); };
      const showToast = (msg, err) => { toast.textContent = msg; toast.className = 'aplyd-cl-toast show' + (err ? ' err' : ''); setTimeout(() => (toast.className = 'aplyd-cl-toast'), 3500); };

      function renderQuestions(questions) {
        qWrap.innerHTML = '';
        if (!questions || !questions.length) return;
        const box = document.createElement('div');
        box.className = 'aplyd-cl-qbox';
        box.innerHTML = `<div class="aplyd-cl-qhint">A couple of things would make this sharper - answer any and I'll weave them in:</div>`;
        questions.forEach((q, i) => {
          const row = document.createElement('div'); row.className = 'aplyd-cl-qrow';
          row.innerHTML = `<div class="aplyd-cl-q">${escapeHtml(q)}</div><input class="aplyd-cl-qinput" data-q="${escapeHtml(q)}" placeholder="Optional answer" />`;
          box.appendChild(row);
        });
        const btn = document.createElement('button'); btn.className = 'aplyd-cl-qbtn'; btn.textContent = 'Add these & redraft';
        btn.onclick = async () => {
          const extra = [...box.querySelectorAll('.aplyd-cl-qinput')].map((el) => el.value.trim() ? `${el.dataset.q} ${el.value.trim()}` : '').filter(Boolean).join('\n');
          if (!extra) { qWrap.innerHTML = ''; return; }
          qWrap.innerHTML = '';
          await generate(extra);
        };
        box.appendChild(btn);
        qWrap.appendChild(box);
      }

      async function generate(extra) {
        setReady(false);
        body.innerHTML = `<div class="aplyd-cl-loading"><span class="aplyd-cl-spin"></span> ${extra ? 'Redrafting with your notes…' : 'Drafting with your resume + portfolio…'}</div>`;
        const { ok, data } = await A.call('/cover/generate', 'POST', { company, role, jobText: ctx.jobText, extra });
        if (!ok || !data || !data.letter) { body.innerHTML = `<div class="aplyd-cl-loading">Could not draft - is the aplyd app running?</div>`; return; }
        current = data.letter;
        sents = renderInitial(body, current);
        renderQuestions(data.questions);
        setReady(true);
        input.focus();
      }

      async function refine() {
        const feedback = input.value.trim();
        if (!feedback || !current) return;
        input.value = '';
        sendBtn.disabled = true; sendBtn.textContent = 'Refining…';
        const { ok, data } = await A.call('/cover/refine', 'POST', { company, role, body: current, feedback, remember: remember.checked });
        sendBtn.textContent = 'Refine'; sendBtn.disabled = false;
        if (ok && data && data.letter) {
          sents = await applyDiff(body, sents, data.letter);
          current = data.letter;
        } else { showToast('Refine failed - try again', true); }
      }

      sendBtn.onclick = refine;
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); refine(); } };

      saveBtn.onclick = async () => {
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const { ok, data } = await A.call('/cover/save', 'POST', { company, role, body: current });
        saveBtn.textContent = 'Save PDF'; saveBtn.disabled = false;
        if (ok && data && data.ok) showToast('Saved → ' + (data.path || 'work-stuff'));
        else showToast('Save failed' + (data && data.error ? ': ' + data.error : ''), true);
      };

      useBtn.onclick = () => {
        if (field && field.el && current) { A.setNativeValue(field.el, current); }
        finish(true);
      };

      generate();
    });
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  window.Aplyd.openCoverStudio = openCoverStudio;
})();
