/* NOTE: There is similar (but currently insanely convoluted)
   functionality in @cocalc/frontend/feature.ts.
*/

declare var window;
export function isIOS(): boolean {
  if (typeof window == "undefined") return false;
  const { navigator } = window;
  return (
    navigator?.userAgent?.match(/Mac/) &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 2
  );
}

export function isSafari(): boolean {
  if (typeof window == "undefined") return false;
  if (isChrome()) return false;
  const { navigator } = window;
  return navigator?.userAgent?.match(/Safari/);
}

export function isChrome(): boolean {
  if (typeof window == "undefined") return false;
  const { navigator } = window;
  return /Chrom(e|ium)/.test(navigator?.userAgent ?? "");
}
