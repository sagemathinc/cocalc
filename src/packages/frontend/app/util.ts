import { webapp_client } from "@cocalc/frontend/webapp-client";

export function blur_active_element(): void {
  if (document.activeElement == null) return;
  // otherwise, it'll be highlighted even when closed again
  (document.activeElement as any).blur?.();
}

export function getNow(): number {
  return webapp_client.server_time().getTime();
}
