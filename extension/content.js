// aplyd - bootstrap. The engine (filler-core.js) and adapters load before
// this. Here we just pick the adapter for this page, show the card if it auto-shows,
// and wire the popup trigger. (Runs on every page; dormant unless an adapter opts in.)
(() => {
  'use strict';
  if (window.top !== window) return; // never run inside iframes (ads, embeds)
  if (window.__aplydBoot) return;
  window.__aplydBoot = true;
  const A = window.Aplyd;
  if (!A) return; // core failed to load

  let activated = false;
  function activate() {
    const adapter = A.pickAdapter(location.href);
    if (!adapter) return;
    A.setAdapter(adapter);
    if (adapter.autoShow) A.ensureAgent();
    if (!activated && adapter.onActivate) { try { adapter.onActivate(); } catch { /* ignore */ } }
    activated = true;
    // continue an apply flow started on LinkedIn (external Apply → new tab)
    A.maybeAutorun(adapter);
  }

  activate();
  // SPA navigations (LinkedIn especially) - re-pick the adapter + keep the card alive.
  let lastUrl = location.href;
  const mo = new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; activated = false; activate(); }
    const a = A.pickAdapter(location.href);
    if (a && a.autoShow) A.ensureAgent();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Trigger from the extension popup ("Autofill this Easy Apply" / "Autofill this page").
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only accept messages from our own extension (popup/background), not page scripts.
    if (!sender || sender.id !== chrome.runtime.id) return false;
    if (msg && msg.type === 'aplyd-run') {
      A.ensureAgent();
      const adapter = A.pickAdapter(location.href);
      if (adapter) { A.setAdapter(adapter); A.runActive(); } else { A.runGeneric(); }
      sendResponse({ started: true });
    }
    return true;
  });
})();
