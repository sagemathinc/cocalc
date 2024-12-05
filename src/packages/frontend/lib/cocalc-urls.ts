import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { is_valid_uuid_string as isUUID } from "@cocalc/util/misc";
import { splitFirst } from "@cocalc/util/misc";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { APP_ROUTES } from "@cocalc/util/routing/app";

function getOrigin(): string {
  // This is a situation where our choice of definition of "/" for the
  // trivial base path is annoying.
  return document.location.origin + (appBasePath.length > 1 ? appBasePath : "");
}

// True if starts with host's URL, but is not a port or proxy URL (e.g.,
// cocalc.com/[project_id]), since it makes no sense to open a proxy server
// URL directly inside CoCalc.
// See https://github.com/sagemathinc/cocalc/issues/4889 and 5423
// for historical discussion of this function.
// NOTE: we used to also handle cloud.sagemath.com URL's, but I have
// deprecated that functionality.  The user just gets a new tab, which
// isn't that bad.
export function isCoCalcURL(href?: string): boolean {
  const origin = getOrigin();
  if (!href?.startsWith(origin)) {
    return false;
  }
  const s = href.slice(origin.length + 1);
  if (isUUID(s.slice(0, 37))) {
    // proxied route
    return false;
  }
  const url = new URL("http://dummy/" + s);
  const path = url.pathname.split("/")[1];
  console.log({
    href,
    s,
    path,
    h: APP_ROUTES.has(path),
    pathname: url.pathname,
    url,
  });
  return APP_ROUTES.has(path);
}

export function parseCoCalcURL(href?: string): {
  page?: string;
  project_id?: string;
  path?: string;
  target?: string;
  fragmentId?: FragmentId;
  query?: string;
  projectPage?: string; // the page inside a project, if not a file, e.g., "new" or "settings"
} {
  const origin = getOrigin();
  if (!href?.startsWith(origin)) {
    return {};
  }
  href = href.slice(origin.length + 1);
  const url = new URL("http://dummy/" + href); // using new URL is a safer way to parse url's
  const fragmentId = Fragment.decode(url.hash.slice(1));
  const query = url.search;
  let pathname = url.pathname.slice(1);
  const i = pathname.indexOf("/");
  if (pathname.startsWith("settings")) {
    // annoyingly, 'account' is what it is called in src/packages/frontend/app/actions.ts
    pathname = "account";
  }
  if (i == -1) {
    return { page: pathname, fragmentId, query };
  }
  const page = pathname.slice(0, i);
  const inPage = pathname.slice(i + 1);
  if (page == "projects") {
    const [project_id, target] = splitFirst(inPage, "/");
    const [projectPage, path] = splitFirst(target ?? "", "/");
    return { page, project_id, target, projectPage, path, fragmentId };
  }
  return { page, target: inPage, fragmentId };
}
