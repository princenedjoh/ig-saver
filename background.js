chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'download') return;

  Promise.all(
    msg.items.map((item) =>
      chrome.downloads.download({
        url: item.url,
        filename: item.filename,
        conflictAction: 'uniquify',
      })
    )
  )
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));

  return true; // keep the channel open for the async response
});
