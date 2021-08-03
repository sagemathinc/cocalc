export function blur_active_element(): void {
  if (document.activeElement == null) return;
  // otherwise, it'll be highlighted even when closed again
  (document.activeElement as any).blur?.();
}
