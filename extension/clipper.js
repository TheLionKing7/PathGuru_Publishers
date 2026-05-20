/* PathGuru Publishers — Clipper Extension Script */

const STORAGE_KEY = 'pg_app_url';

async function init () {
  // Load saved app URL
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) {
    document.getElementById('appUrl').value = stored[STORAGE_KEY];
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById('pageTitle').textContent = tab.title || tab.url;
    document.getElementById('pageUrl').textContent   = tab.url   || '';
  }

  document.getElementById('clipBtn').addEventListener('click', async () => {
    const appUrl = document.getElementById('appUrl').value.trim().replace(/\/$/, '');
    const topic  = document.getElementById('topicOverride').value.trim() || tab?.title || '';
    const clip   = tab?.url || '';
    const status = document.getElementById('status');

    if (!appUrl) {
      status.textContent = 'Enter your PathGuru app URL first.';
      status.className   = 'status err';
      return;
    }
    if (!appUrl.startsWith('http')) {
      status.textContent = 'URL must start with https://';
      status.className   = 'status err';
      return;
    }

    // Save app URL
    await chrome.storage.local.set({ [STORAGE_KEY]: appUrl });

    // Build target URL
    const params = new URLSearchParams({ clip, topic });
    const target = `${appUrl}?${params.toString()}`;

    // Open PathGuru in a new tab
    chrome.tabs.create({ url: target });
    status.textContent = 'Opening PathGuru…';
    status.className   = 'status ok';
  });
}

init().catch(e => {
  document.getElementById('status').textContent = e.message;
  document.getElementById('status').className   = 'status err';
});
