import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export function appUrl(path: string): string {
  const base = appBasePath.endsWith("/")
    ? appBasePath.slice(0, -1)
    : appBasePath;
  return `${base}/${path}`;
}
