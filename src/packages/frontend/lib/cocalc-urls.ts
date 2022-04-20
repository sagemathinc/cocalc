import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { is_valid_uuid_string as isUUID } from "@cocalc/util/misc";
import { splitFirst } from "@cocalc/util/misc";

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
  return (
    href != null &&
    href.startsWith(origin) &&
    !isUUID(href.slice(origin.length + 1, origin.length + 37))
  );
}

export function parseCoCalcURL(href?: string): {
  page?: string;
  project_id?: string;
  path?: string;
  target?: string;
  anchor?: string;
  query?: string;
  projectPage?: string; // the page inside a project, if not a file, e.g., "new" or "settings"
} {
  const origin = getOrigin();
  if (!href?.startsWith(origin)) {
    return {};
  }
  href = href.slice(origin.length + 1);
  const [hrefNoQuery, query] = splitFirst(href, "?");
  const [hrefPlain, anchor] = splitFirst(hrefNoQuery, "#");
  const i = hrefPlain.indexOf("/");
  if (i == -1) {
    return { page: hrefPlain, anchor, query };
  }
  const page = hrefPlain.slice(0, i);
  const inPage = hrefPlain.slice(i + 1);
  if (page == "projects") {
    const [project_id, target] = splitFirst(inPage, "/");
    const [projectPage, path] = splitFirst(target ?? "", "/");
    return { page, project_id, target, projectPage, path, anchor };
  }
  return { page, target: inPage };
}
