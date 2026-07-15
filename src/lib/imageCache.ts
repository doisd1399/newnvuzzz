type ImageCacheEntry = {
  image: HTMLImageElement;
  promise: Promise<void>;
  ready: boolean;
};

const MAX_PRELOADED_IMAGES = 200;

// Keep the Image element alive after the request finishes. Besides avoiding a
// second request, this gives the browser a much better chance of reusing the
// already-decoded bitmap when the same URL is mounted in the interface. The
// bounded LRU prevents a long session with many users from growing memory
// without limit; the browser's own HTTP cache remains available after eviction.
const preloadedImages = new Map<string, ImageCacheEntry>();

const normalizeImageUrl = (url?: string | null) => url?.trim() || "";

const touchEntry = (url: string, entry: ImageCacheEntry) => {
  preloadedImages.delete(url);
  preloadedImages.set(url, entry);
};

const evictReadyEntries = () => {
  if (preloadedImages.size <= MAX_PRELOADED_IMAGES) return;

  for (const [url, entry] of preloadedImages) {
    // Never evict an image while its request/decode is still in flight.
    if (!entry.ready) continue;
    preloadedImages.delete(url);
    if (preloadedImages.size <= MAX_PRELOADED_IMAGES) break;
  }
};

const decodeWithTimeout = (image: HTMLImageElement): Promise<void> => {
  if (typeof image.decode !== "function") return Promise.resolve();

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 350);

    try {
      Promise.resolve(image.decode()).then(finish).catch(finish);
    } catch {
      finish();
    }
  });
};

export function isImageReady(url?: string | null): boolean {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) return false;

  const entry = preloadedImages.get(normalizedUrl);
  if (!entry) return false;
  touchEntry(normalizedUrl, entry);
  return entry.ready;
}

/**
 * Starts one browser-native preload per URL. The browser keeps the decoded
 * response in its normal cache, so route changes can reuse it without creating
 * Blob/ObjectURL copies or downloading the same image repeatedly.
 */
export function preloadImage(url?: string | null): Promise<void> {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl || typeof window === "undefined") {
    return Promise.resolve();
  }

  const existing = preloadedImages.get(normalizedUrl);
  if (existing) {
    touchEntry(normalizedUrl, existing);
    return existing.promise;
  }

  const image = new Image();
  image.decoding = "async";

  const entry: ImageCacheEntry = {
    image,
    ready: false,
    promise: Promise.resolve(),
  };

  entry.promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = async (loaded: boolean) => {
      if (settled) return;
      settled = true;

      if (loaded) {
        // Some mobile Preview/WebView implementations leave decode() pending
        // indefinitely. Never let that stall the warm-up queue.
        await decodeWithTimeout(image);
        entry.ready = true;
        evictReadyEntries();
      } else if (preloadedImages.get(normalizedUrl) === entry) {
        // Do not permanently cache a transient network failure. A later mount
        // or connectivity recovery must be allowed to retry the same URL.
        preloadedImages.delete(normalizedUrl);
      }

      resolve();
    };

    image.onload = () => void finish(true);
    image.onerror = () => void finish(false);
    image.src = normalizedUrl;
  });

  preloadedImages.set(normalizedUrl, entry);
  evictReadyEntries();
  return entry.promise;
}

/** Warm a bounded number of images at a time so a large fleet does not
 * monopolize the connection or delay Firestore/API requests. */
export function preloadImages(
  urls: Array<string | null | undefined>,
  concurrency = 4,
): Promise<void> {
  const uniqueUrls = Array.from(
    new Set(urls.map(normalizeImageUrl).filter(Boolean)),
  );
  if (uniqueUrls.length === 0) return Promise.resolve();

  let cursor = 0;
  const worker = async () => {
    while (cursor < uniqueUrls.length) {
      const url = uniqueUrls[cursor++];
      await preloadImage(url);
    }
  };

  const workerCount = Math.min(Math.max(concurrency, 1), uniqueUrls.length);
  return Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  ).then(() => undefined);
}
