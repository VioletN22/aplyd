// Generic adapter - the catch-all for any career site we don't have a tuned adapter
// for. Matches everything (registered LAST so specific adapters win). Never auto-shows;
// runs only when the user clicks "Autofill this page" in the popup. Fill-and-wait.
(() => {
  function densestForm() {
    const forms = [...document.querySelectorAll('form')];
    if (!forms.length) return document.body; // some ATS don't wrap fields in a <form>
    let best = forms[0], bestN = -1;
    for (const f of forms) {
      const n = f.querySelectorAll('input, select, textarea').length;
      if (n > bestN) { bestN = n; best = f; }
    }
    return bestN > 0 ? best : document.body;
  }

  function meta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? el.getAttribute('content') : '';
  }
  function jobContext() {
    const title = (document.querySelector('h1') || {}).innerText || document.title || 'Role';
    const company = meta('og:site_name') || location.hostname.replace(/^(www|jobs|careers|apply|boards)\./, '').split('.')[0];
    return {
      title: title.trim().slice(0, 120),
      company: company.charAt(0).toUpperCase() + company.slice(1),
      jobText: (document.querySelector('main, article, #content, .content') || document.body).innerText.slice(0, 4000),
      jobUrl: location.href.split('?')[0],
    };
  }

  (window.AplydAdapters = window.AplydAdapters || []).push({
    id: 'generic',
    subtitle: 'Application assistant',
    autoShow: false,
    autoAdvance: false,
    matches: () => true,
    jobContext,
    getFormRoot: densestForm,
  });
})();
