export let appBasePath: string = "/";

export function setAppBasePath(path: string): void {
  appBasePath = path;
  if (typeof window != "undefined") {
    window.app_base_path = path;
  }
}

// This is used by next.js.   In normal static webapp,
// setAppBasePath is called in static/src/init-app-base-path.
if (process.env.CUSTOMIZE) {
  try {
    const appBasePath = JSON.parse(process.env.CUSTOMIZE)?.appBasePath;
    if (appBasePath != null) {
      setAppBasePath(appBasePath);
    }
  } catch (_) {}
}
