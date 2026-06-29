// Lever adapter. Native fields on jobs.lever.co/<company>/<id>/apply. Fill-and-wait.
(() => {
  function cap(s) { return (s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim(); }

  function jobContext() {
    const m = location.pathname.match(/^\/([^/?]+)/);
    const company = m ? cap(decodeURIComponent(m[1])) : 'Unknown';
    const role = (document.querySelector('.posting-headline h2, .section-wrapper h2, h2, h1') || {}).innerText || document.title;
    return {
      title: (role || '').trim().slice(0, 120),
      company,
      jobText: (document.querySelector('.section-wrapper .section, .posting-description, [data-qa="job-description"]') || {}).innerText?.slice(0, 5000) || '',
      jobUrl: location.href.split('?')[0],
    };
  }

  (window.AplydAdapters = window.AplydAdapters || []).push({
    id: 'lever',
    subtitle: 'Lever application',
    autoShow: true,
    autoAdvance: false,
    matches: (url) => /jobs\.lever\.co/.test(url),
    jobContext,
    getFormRoot: () =>
      document.querySelector('form.application-form, [data-qa="application-form"], form[action*="lever"]')
      || document.querySelector('main form, form'),
  });
})();
