// LinkedIn Easy Apply adapter. Modal-based, auto-advances through steps (safe in
// LinkedIn's sandboxed modal). Also stashes the viewed job so an external Apply
// tab can label the application correctly.
(() => {
  const A = window.Aplyd;
  const isVisible = (el) => !!(el && el.offsetParent !== null && !el.disabled);

  function pick(sels) {
    for (const s of sels) { const e = document.querySelector(s); if (e && e.innerText.trim()) return e.innerText.trim(); }
    return '';
  }
  function jobContext() {
    return {
      title: pick(['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', 'h1.t-24', 'h1']),
      company: pick(['.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name']),
      jobText: pick(['.jobs-description__content', '#job-details', '.jobs-box__html-content']).slice(0, 5000),
      jobUrl: location.href.split('?')[0],
    };
  }

  (window.AplydAdapters = window.AplydAdapters || []).push({
    id: 'linkedin',
    subtitle: 'LinkedIn Easy Apply',
    autoShow: true,
    autoAdvance: true,
    matches: (url) => /^https:\/\/www\.linkedin\.com\//.test(url),
    jobContext,

    getFormRoot: () => {
      // The modal is position:fixed, so offsetParent is null - judge visibility by
      // on-screen size instead. Find any visible dialog that holds form fields.
      const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 120; };
      const cands = [...document.querySelectorAll('.jobs-easy-apply-modal, [data-test-modal], [role="dialog"], .artdeco-modal')];
      return cands.find((d) => onScreen(d) && d.querySelector('input, select, textarea'))
        || cands.find((d) => onScreen(d) && /easy apply|submit application|contact info|your answers|home address/i.test(d.innerText))
        || null;
    },

    async openForm() {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; };
      // a category tab / nav pill, NOT the apply button (the collections/easy-apply
      // page has an "Easy Apply" filter tab that must be ignored)
      const isTab = (el) => el.getAttribute('role') === 'tab' || !!el.closest('[role="tablist"], nav, header, .search-reusables__filter-list');

      // the REAL Easy Apply button - by class, or aria-label "Easy Apply to <job>",
      // or exact text "Easy Apply" on a button that isn't a tab
      let easy = [...document.querySelectorAll('button.jobs-apply-button')].find(vis);
      if (!easy) {
        const btns = [...document.querySelectorAll('button')].filter(vis);
        easy = btns.find((b) => /easy apply to /i.test(b.getAttribute('aria-label') || ''))
          || btns.find((b) => /^easy apply$/i.test((b.innerText || '').trim()) && !isTab(b));
      }
      if (easy) { easy.click(); return; } // modal opens in-page; core polls for it

      // external apply (button text "Apply" with an off-site link) - the form is on
      // the company's site in a new tab. Stash a "continue" flag so the new tab keeps
      // going automatically, then click Apply (synchronously, to keep the user gesture
      // so the browser doesn't block the new tab).
      const els = [...document.querySelectorAll('button, a')].filter(vis);
      const ext = els.find((b) => {
        const t = (b.innerText || '').trim();
        const al = b.getAttribute('aria-label') || '';
        return (/^apply\b/i.test(t) || /apply to /i.test(al)) && !/easy apply/i.test(t + al) && !isTab(b);
      });
      if (ext) {
        const ctx = jobContext();
        A.call('/pending-job', 'POST', { job: { company: ctx.company, title: ctx.title, jobText: ctx.jobText, jobUrl: ctx.jobUrl, autorun: true } });
        ext.click();
        return 'external';
      }
      return undefined;
    },

    footerButtons(modal) {
      const btns = [...modal.querySelectorAll('button')].filter(isVisible);
      const find = (re) => btns.find((b) => re.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
      return {
        // Submit/terminal buttons - we NEVER click these; we only detect them to stop.
        submit: find(/^submit application/i) || find(/^submit$/i) || find(/^done$/i),
        review: find(/review/i),
        // Intentionally NO bare /^continue$/i here: on some flows the FINAL step's
        // button reads "Continue", and clicking it could submit. We only advance via
        // the unambiguous "Next"/"Continue to next step" labels.
        next: find(/continue to next step/i) || find(/^next$/i),
      };
    },

    // Detect the LinkedIn step-progress so the engine knows when it's on the LAST
    // step and must hand off to the user instead of auto-advancing. Returns
    // { current, total } when readable, else null. Reads the progress bar's
    // aria-valuenow/valuemax, or a "Step X of Y" / "X of Y" label.
    stepProgress(modal) {
      const root = modal || document;
      const pb = root.querySelector('[role="progressbar"], progress, .artdeco-completeness-meter-linear__progress-bar, [aria-label*="completion" i]');
      if (pb) {
        const now = Number(pb.getAttribute('aria-valuenow'));
        const max = Number(pb.getAttribute('aria-valuemax'));
        if (Number.isFinite(now) && Number.isFinite(max) && max > 0) return { current: now, total: max };
      }
      const txt = (root.innerText || '');
      const m = txt.match(/step\s+(\d+)\s+of\s+(\d+)/i) || txt.match(/\b(\d+)\s+of\s+(\d+)\b/);
      if (m) return { current: Number(m[1]), total: Number(m[2]) };
      return null;
    },

    // stash the current job so an external ATS tab can read it (handoff)
    onActivate() {
      const ctx = jobContext();
      if (ctx.company && ctx.title) {
        A.call('/pending-job', 'POST', { job: { company: ctx.company, title: ctx.title, jobText: ctx.jobText, jobUrl: ctx.jobUrl } });
      }
    },
  });
})();
