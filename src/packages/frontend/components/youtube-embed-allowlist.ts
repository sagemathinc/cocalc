export function parseYouTubeEmbedId(src: string): string | null {
  try {
    const u = new URL(src, "https://dummy.example"); // handle relative
    if (u.protocol !== "https:") return null;

    const host = u.hostname.toLowerCase();
    const allowedHosts = new Set([
      "www.youtube.com",
      "youtube.com",
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
    ]);

    if (!allowedHosts.has(host)) return null;

    // Only allow /embed/<VIDEO_ID> (11-char ID)
    const m = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})$/);
    if (!m) return null;
    return m[1]; // the 11-char video id
  } catch {
    return null;
  }
}

export function buildSafeYouTubeIframeHTML(
  videoId: string,
  opts?: { width?: string; height?: string; title?: string },
): string {
  const width =
    opts?.width && /^\d{1,4}$/.test(opts.width) ? opts.width : "560";
  const height =
    opts?.height && /^\d{1,4}$/.test(opts.height) ? opts.height : "315";
  const title = (opts?.title ?? "YouTube video player").replace(/"/g, "&quot;");

  // Force privacy-enhanced domain and a tight, fixed attribute set
  const src = `https://www.youtube-nocookie.com/embed/${videoId}`;

  return `<iframe width="${width}" height="${height}" src="${src}" title="${title}" frameborder="0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}
