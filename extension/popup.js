// Ping the aplyd local bridge so the popup can show connection status.
const el = document.getElementById('status');
const txt = document.getElementById('status-text');
const runBtn = document.getElementById('run');
const runNote = document.getElementById('run-note');

fetch('http://127.0.0.1:17872/status')
  .then((r) => r.json())
  .then((d) => {
    if (d && d.ok) { el.classList.add('on'); txt.textContent = 'Connected to aplyd'; }
    else throw new Error();
  })
  .catch(() => { el.classList.add('off'); txt.textContent = 'aplyd app not running'; });

// Enable the Autofill button on any web page (LinkedIn or an external ATS).
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const onWeb = tab && /^https:\/\//.test(tab.url || '');
  if (onWeb) {
    runBtn.disabled = false;
    runNote.textContent = 'Make sure the application form is open on the page.';
  } else {
    runBtn.disabled = true;
    runNote.textContent = 'Open a job application tab to use Autofill.';
  }

  runBtn.addEventListener('click', () => {
    if (!tab) return;
    runBtn.textContent = 'Running…';
    runBtn.disabled = true;
    chrome.tabs.sendMessage(tab.id, { type: 'aplyd-run' }, () => {
      // content script took over; close the popup so it doesn't steal focus
      window.close();
    });
  });
});
