/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Define a jQuery plugin that processes links.

 - Make all links open internally or in a new tab; etc.
 - Makes relative image, video, object and source paths work.
 - Handles anchor links
*/

import { join } from "path";
import { is_valid_uuid_string as isUUID } from "@cocalc/util/misc";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

type jQueryAPI = Function;

interface Options {
  $: jQueryAPI; // something with jquery api -- might be cheerio or jQuery itself.
  urlTransform?: (url: string, tag?: string) => string | undefined;
  projectId?: string;
  filePath?: string;
  projectActions?: {
    load_target: (
      target: string,
      switchTo: boolean,
      a: boolean,
      b: boolean,
      anchor: string
    ) => void;
  };
}

function loadTarget(
  target: string,
  switchTo: boolean,
  anchor: string,
  projectActions: { load_target: Function }
): void {
  // get rid of "?something" in "path/file.ext?something"
  const i = target.lastIndexOf("/");
  if (i > 0) {
    const j = target.slice(i).indexOf("?");
    if (j >= 0) target = target.slice(0, i + j);
  }
  projectActions.load_target(target, switchTo, false, true, anchor);
}

// True if starts with host's URL, but is not of the form (say) cocalc.com/[projectId], since
// that would refer to a port or server, which we can't open internally.
// See https://github.com/sagemathinc/cocalc/issues/4889 and 5423.
export function startsWithCloudURL(href: string): boolean {
  // This is one situation where our choice of definition of "/" for the
  // trivial base path is annoying.
  const origin =
    document.location.origin + (appBasePath.length > 1 ? appBasePath : "");
  const isSamedomain: boolean =
    href.startsWith(origin) &&
    !isUUID(href.slice(origin.length + 1, origin.length + 37));
  const isFormerSMC: boolean =
    document.location.origin === "https://cocalc.com" &&
    href.startsWith("https://cloud.sagemath.com"); // don't break ANCIENT deprecated old links.
  return isSamedomain || isFormerSMC;
}

function processAnchorTag(y: any, opts: Options): void {
  let href = y?.attr("href");
  if (typeof href != "string") {
    return;
  }
  if (opts.urlTransform != null) {
    // special option; used, e.g., for Jupyter's attachment: url's
    href = opts.urlTransform(href, "a") ?? href;
    y.attr("href", href);
  }
  if (href[0] === "#") {
    // CASE: internal link on same document. We have to do some ugly stuff here, since
    // background tabs may result in multiple copies of the same id (with most not visible).
    href = y[0].baseURI + href; // will get handled below.
  }
  if (href.startsWith("mailto:")) {
    return; // do nothing
  }
  const { projectActions } = opts;
  if (
    projectActions &&
    startsWithCloudURL(href) &&
    href.includes("/projects/")
  ) {
    // CASE: Link inside a specific browser tab.
    // target starts with cloud URL or is absolute, and has /projects/ in it,
    // so we open the link directly inside this browser tab.
    // WARNING: there are cases that could be wrong via this heuristic, e.g.,
    // a raw link that happens to have /projects/ in it -- deal with them someday...
    y.click(function (e): boolean {
      let anchor;
      const url = href;
      const i = url.indexOf("/projects/");
      let target = url.slice(i + "/projects/".length);
      const v = target.split("#");
      if (v.length > 1) {
        [target, anchor] = v;
      } else {
        anchor = undefined;
      }
      loadTarget(
        decodeURI(target),
        !(e.which === 2 || e.ctrlKey || e.metaKey),
        anchor,
        projectActions
      );
      return false;
    });
  } else if (
    projectActions &&
    href.indexOf("http://") !== 0 &&
    href.indexOf("https://") !== 0
  ) {
    // does not start with http
    // internal link
    y.click(function (e): boolean {
      let anchor;
      let target = href;
      const v = target.split("#");
      if (v.length > 1) {
        [target, anchor] = v;
      } else {
        anchor = undefined;
      }
      // if DEBUG then console.log "target", target
      if (target.indexOf("/projects/") === 0) {
        // fully absolute (but without https://...)
        target = decodeURI(target.slice("/projects/".length));
      } else if (
        target[0] === "/" &&
        target[37] === "/" &&
        isUUID(target.slice(1, 37))
      ) {
        // absolute path with /projects/ omitted -- /..projectId../files/....
        target = decodeURI(target.slice(1)); // just get rid of leading slash
      } else if (target[0] === "/" && opts.projectId) {
        // absolute inside of project -- we CANNOT use join here
        // since it is critical to **keep** the slash to get
        //   .../files//path/to/somewhere
        // Otherwise, there is now way to represent an absolute path.
        // A URL isn't just a unix path in general.
        target = opts.projectId + "/files/" + decodeURI(target);
      } else if (opts.projectId && opts.filePath != null) {
        // realtive to current path
        let x: string = decodeURI(target);
        if (x == null) x = "";
        target = join(opts.projectId, "files", opts.filePath ?? "", x);
      }
      loadTarget(
        target,
        !(e.which === 2 || e.ctrlKey || e.metaKey),
        anchor,
        projectActions
      );
      return false;
    });
  } else {
    // make links open in a new tab by default
    y.attr("target", "_blank");
    y.attr("rel", "noopener");
  }
}

function processAnchorTags(e: any, opts: Options): void {
  for (const x of e?.find?.("a") ?? []) {
    processAnchorTag(opts.$(x), opts);
  }
}

function processMediaTag(
  y: any,
  tag: string,
  attr: string,
  opts: Options
): void {
  let newSrc: string | undefined = undefined;
  let src: string | undefined = y.attr(attr);
  if (src == null) {
    return;
  }
  if (opts.urlTransform != null) {
    src = opts.urlTransform(src, tag) ?? src;
    y.attr(attr, src);
  }
  if (src[0] === "/" || src.slice(0, 5) === "data:") {
    // absolute path or data: url
    newSrc = src;
  } else if (opts.projectId != null && opts.filePath != null) {
    let projectId: string;
    const i = src.indexOf("/projects/");
    const j = src.indexOf("/files/");
    if (startsWithCloudURL(src) && i !== -1 && j !== -1 && j > i) {
      // the href is inside the app, points to the current project or another one
      // j-i should be 36, unless we ever start to have different (vanity) project_ids
      const path = src.slice(j + "/files/".length);
      projectId = src.slice(i + "/projects/".length, j);
      newSrc = join(appBasePath, projectId, "raw", path);
      y.attr(attr, newSrc);
      return;
    }
    if (src.indexOf("://") !== -1) {
      // link points somewhere else
      return;
    }
    // we do not have an absolute url, hence we assume it is a
    // relative URL to a file in a project
    newSrc = join(appBasePath, opts.projectId, "raw", opts.filePath, src);
  }
  if (newSrc != null) {
    y.attr(attr, newSrc);
  }
}

function processMediaTags(e, opts: Options) {
  for (const [tag, attr] of [
    ["img", "src"],
    ["object", "data"],
    ["video", "src"],
    ["source", "src"],
    ["audio", "src"],
  ]) {
    for (const x of e.find(tag)) {
      processMediaTag(opts.$(x), tag, attr, opts);
    }
  }
}

export default function processLinks(elt, opts: Options) {
  elt.each((_, x) => {
    const e = opts.$(x);
    // part #1: process <a> anchor tags
    processAnchorTags(e, opts);
    // part #2: process <img>, <object> and <video>/<source> tags
    // make relative links to images use the raw server
    processMediaTags(e, opts);
  });
}
