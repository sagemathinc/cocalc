import { redux } from "@cocalc/frontend/app-framework";

function getHostValue(host: any, key: string): string | undefined {
  if (!host) return;
  return host.get ? host.get(key) : host[key];
}

export function getProjectHostBase(project_id: string): string {
  const project_map = redux.getStore("projects")?.get("project_map");
  const project = project_map?.get(project_id);
  const projectAny = project as any;
  const host = projectAny?.get ? projectAny.get("host") : projectAny?.host;
  if (!host) return "";
  const public_url = getHostValue(host, "public_url");
  const internal_url = getHostValue(host, "internal_url");
  return public_url || internal_url || "";
}

export function withProjectHostBase(
  project_id: string,
  url?: string,
): string | undefined {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  const base = getProjectHostBase(project_id);
  if (!base) return url;
  const baseTrimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${baseTrimmed}${path}`;
}
