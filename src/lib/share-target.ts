// Files shared to the installed app from another app (WhatsApp, the gallery).
// public/sw.js receives them and keeps them in a cache; keep these names in step with it.
export const SHARE_PATH = "/receiving/share";
export const SHARE_FIELD = "files";
const SHARE_CACHE = "shared-files";

/** Takes the files that were shared to the app, in the order they were shared, and forgets them. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined" || !(await caches.has(SHARE_CACHE))) {
    return [];
  }
  const cache = await caches.open(SHARE_CACHE);
  const order = (request: Request) => Number(request.url.split("/").pop());
  const requests = [...(await cache.keys())].sort((a, b) => order(a) - order(b));
  const files: File[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const name = decodeURIComponent(response.headers.get("X-File-Name") ?? "") || `shared-${files.length + 1}`;
      files.push(new File([await response.blob()], name, { type: response.headers.get("Content-Type") ?? "" }));
    }
  }
  await caches.delete(SHARE_CACHE);
  return files;
}
