// MV3 service worker — cookie helper for CSRF/session if needed.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'GET_AUTH_COOKIES') {
      try {
        const [csrftoken, session] = await Promise.all([
          chrome.cookies.get({ url: "https://leetcode.com", name: "csrftoken" }),
          chrome.cookies.get({ url: "https://leetcode.com", name: "LEETCODE_SESSION" })
        ]);
        sendResponse({
          ok: true,
          csrftoken: csrftoken?.value ?? null,
          session: session?.value ?? null
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return; // keep channel open for sendResponse
    }
  })();
  return true; // async response
});
// LeetBoost background script
