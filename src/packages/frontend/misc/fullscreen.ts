/*
Set fullscreen and check fullscreen in a way that works
on Chrome/Firefox/Safari, when possible.

This is generic code with no dependency.
*/

export async function requestFullscreen(
  element = document.documentElement
): Promise<void> {
  if (element?.requestFullscreen != null) {
    await element.requestFullscreen();
  } else if ((element as any)?.webkitRequestFullscreen != null) {
    await (element as any).webkitRequestFullscreen();
  } else {
    throw Error("no fullscreen api available");
  }
}

export function isFullscreen() {
  return !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
}

export function exitFullscreen() {
  if (document.exitFullscreen != null) {
    document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen != null) {
    (document as any).webkitExitFullscreen();
  }
}
