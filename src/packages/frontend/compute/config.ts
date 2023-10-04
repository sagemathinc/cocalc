import { redux } from "@cocalc/frontend/app-framework";
import { CLOUDS, Cloud } from "@cocalc/util/db-schema/compute-servers";

export function computeServersEnabled() {
  const customize = redux.getStore("customize");
  if (customize == null) {
    return false;
  }
  if (!customize.get("compute_servers_enabled")) {
    return false;
  }
  for (const cloud in CLOUDS) {
    if (customize.get(`compute_servers_${cloud}_enabled`)) {
      return true;
    }
  }
  return false;
}

export function availableClouds(): Cloud[] {
  const v: Cloud[] = [];
  const customize = redux.getStore("customize");
  if (customize == null) {
    return v;
  }
  for (const cloud in CLOUDS) {
    if (customize.get(`compute_servers_${cloud}_enabled`)) {
      v.push(CLOUDS[cloud].name);
    }
  }
  return v;
}

