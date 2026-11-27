// Receives files shared to the installed app (Android's "Share" sheet, from WhatsApp for one).
// The browser posts them to SHARE_PATH; they are kept in a cache until the upload screen takes them.
// Keep SHARE_PATH and SHARE_CACHE in step with src/lib/share-target.ts.
const SHARE_PATH = "/receiving/share";
const SHARE_CACHE = "shared-files";
const UPLOAD_PATH = "/receiving/new";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== SHARE_PATH) {
    return;
  }
  event.respondWith(receive(event.request));
});

async function receive(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((entry) => entry instanceof File);
    // A new share replaces one that was never picked up.
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(
      files.map((file, index) =>
        cache.put(
          `${SHARE_PATH}/${index}`,
          new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-File-Name": encodeURIComponent(file.name),
            },
          }),
        ),
      ),
    );
    return Response.redirect(UPLOAD_PATH, 303);
  } catch {
    return Response.redirect(`${UPLOAD_PATH}?shared=missed`, 303);
  }
}
