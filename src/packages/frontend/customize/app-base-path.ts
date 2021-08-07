function init(): string {
  if (process.env.CUSTOMIZE) {
    // This is used by next.js.   In normal static webapp,
    // setAppBasePath is called in static/src/init-app-base-path.
    try {
      const appBasePath = JSON.parse(process.env.CUSTOMIZE)?.appBasePath;
      if (appBasePath != null) {
        return appBasePath;
      }
    } catch (_) {}
  }
  if (typeof window != "undefined" && typeof window.location != "undefined") {
    // For static frontend we can determine the base url from the window.location
    const { pathname } = window.location;
    const i = pathname.lastIndexOf("/static");
    if (i != -1) {
      return i == 0 ? "/" : pathname.slice(0, i);
    }
  }
  return "/";
}

export let appBasePath: string = init();
