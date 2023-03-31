function init(): string {
  console.log("app-base-path init!");
  if (process.env.BASE_PATH) {
    // This is used by next.js.
    return process.env.BASE_PATH;
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
