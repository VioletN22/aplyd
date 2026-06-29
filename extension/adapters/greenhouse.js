// Greenhouse adapter. Mostly native HTML fields; single long form. Fill-and-wait.
// Covers both the hosted boards (boards.greenhouse.io) and embedded iframes.
(() => {
  function cap(s) { return (s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim(); }

  function jobContext() {
    const role = (document.querySelector('.app-title, h1.section-header, h1') || {}).innerText || document.title;
    // boards.greenhouse.io/<company>/jobs/<id>
    let company = '';
    const m = location.pathname.match(/^\/(?:embed\/job_app\?for=)?([^/?]+)/);
    if (m) company = cap(decodeURIComponent(m[1]));
    const byEl = document.querySelector('.company-name, .level-0 .company');
    if (byEl && byEl.innerText.trim()) company = byEl.innerText.trim();
    return {
      title: (role || '').trim().slice(0, 120),
      company: company || 'Unknown',
      jobText: (document.querySelector('#content, .main, #job_description, .job__description') || {}).innerText?.slice(0, 5000) || '',
      jobUrl: location.href.split('?')[0],
    };
  }

  (window.AplydAdapters = window.AplydAdapters || []).push({
    id: 'greenhouse',
    subtitle: 'Greenhouse application',
    autoShow: true,
    autoAdvance: false,
    matches: (url) => /greenhouse\.io/.test(url),
    jobContext,
    getFormRoot: () =>
      document.querySelector('#application_form, form#application-form, form[action*="greenhouse"], #application, .application--form')
      || document.querySelector('main form, form'),
  });
})();
