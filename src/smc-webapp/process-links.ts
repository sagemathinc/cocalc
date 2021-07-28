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
declare const $: any;

import { is_valid_uuid_string, startswith } from "smc-util/misc";
import { redux } from "./app-framework";

function load_target(target: string, switch_to: boolean, anchor: string): void {
  const actions = redux.getActions("projects");
  if (actions == null) {
    throw Error("unable to load target because projects Actions not defined");
  }
  // get rid of "?something" in "path/file.ext?something"
  const i = target.lastIndexOf("/");
  if (i > 0) {
    const j = target.slice(i).indexOf("?");
    if (j >= 0) target = target.slice(0, i + j);
  }
  actions.load_target(target, switch_to, false, true, anchor);
}

// True if starts with host's URL, but is not of the form (say) cocalc.com/[project_id], since
// that would refer to a port or server, which we can't open internally.
// See https://github.com/sagemathinc/cocalc/issues/4889
export function starts_with_cloud_url(href: string): boolean {
  const origin = document.location.origin + window.app_base_path;
  const is_samedomain: boolean =
    startswith(href, origin) &&
    !is_valid_uuid_string(href.slice(origin.length + 1, origin.length + 37));
  const is_former_smc: boolean =
    document.location.origin === "https://cocalc.com" &&
    startswith(href, "https://cloud.sagemath.com"); // don't break ANCIENT deprecated old links.
  return is_samedomain || is_former_smc;
}

interface Options {
  href_transform?: (string) => string;
  project_id?: string;
  file_path?: string;
}

interface Options2 {
  href_transform?: (string) => string;
  project_id?: string;
  file_path?: string;
}

function process_anchor_tag(y: any, opts: Options): void {
  let href = y.attr("href");
  if (href == null) {
    return;
  }
  if (opts.href_transform != null) {
    // special option; used, e.g., for Jupyter's attachment: url's
    href = opts.href_transform(href);
  }
  if (href[0] === "#") {
    // CASE: internal link on same document. We have to do some ugly stuff here, since
    // background tabs may result in multiple copies of the same id (with most not visible).
    href = y[0].baseURI + href; // will get handled below.
  }
  if (startswith(href, "mailto:")) {
    return; // do nothing
  }
  if (starts_with_cloud_url(href) && href.indexOf("/projects/") !== -1) {
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
      load_target(
        decodeURI(target),
        !(e.which === 2 || e.ctrlKey || e.metaKey),
        anchor
      );
      return false;
    });
  } else if (href.indexOf("http://") !== 0 && href.indexOf("https://") !== 0) {
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
        is_valid_uuid_string(target.slice(1, 37))
      ) {
        // absolute path with /projects/ omitted -- /..project_id../files/....
        target = decodeURI(target.slice(1)); // just get rid of leading slash
      } else if (target[0] === "/" && opts.project_id) {
        // absolute inside of project -- we CANNOT use join here
        // since it is critical to **keep** the slash to get
        //   .../files//path/to/somewhere
        // Otherwise, there is now way to represent an absolute path.
        // A URL isn't just a unix path in general.
        target = opts.project_id + "/files/" + decodeURI(target);
      } else if (opts.project_id && opts.file_path != null) {
        // realtive to current path
        let x: string = decodeURI(target);
        if (x == null) x = "";
        target = join(opts.project_id, "files", opts.file_path ?? "", x);
      }
      load_target(target, !(e.which === 2 || e.ctrlKey || e.metaKey), anchor);
      return false;
    });
  } else {
    // make links open in a new tab by default
    y.attr("target", "_blank");
    y.attr("rel", "noopener");
  }
}

function process_anchor_tags(e: any, opts: Options): void {
  for (const x of e.find("a")) {
    process_anchor_tag($(x), opts);
  }
}

function process_media_tag(y: any, attr: string, opts: Options2): void {
  let new_src: string | undefined = undefined;
  let src: string | undefined = y.attr(attr);
  if (src == null) {
    return;
  }
  if (opts.href_transform != null) {
    src = opts.href_transform(src);
  }
  if (src[0] === "/" || src.slice(0, 5) === "data:") {
    // absolute path or data: url
    new_src = src;
  } else if (opts.project_id != null && opts.file_path != null) {
    let project_id: string;
    const i = src.indexOf("/projects/");
    const j = src.indexOf("/files/");
    if (starts_with_cloud_url(src) && i !== -1 && j !== -1 && j > i) {
      // the href is inside the app, points to the current project or another one
      // j-i should be 36, unless we ever start to have different (vanity) project_ids
      const path = src.slice(j + "/files/".length);
      project_id = src.slice(i + "/projects/".length, j);
      new_src = join(window.app_base_path, project_id, "raw", path);
      y.attr(attr, new_src);
      return;
    }
    if (src.indexOf("://") !== -1) {
      // link points somewhere else
      return;
    }
    // we do not have an absolute url, hence we assume it is a
    // relative URL to a file in a project
    new_src = join(
      window.app_base_path,
      opts.project_id,
      "raw",
      opts.file_path,
      src
    );
  }
  if (new_src != null) {
    y.attr(attr, new_src);
  }
}

function process_media_tags(e, opts: Options2) {
  for (const [tag, attr] of [
    ["img", "src"],
    ["object", "data"],
    ["video", "src"],
    ["source", "src"],
    ["audio", "src"],
  ]) {
    for (const x of e.find(tag)) {
      process_media_tag($(x), attr, opts);
    }
  }
}

$.fn.process_smc_links = function (opts: Options = {}) {
  this.each(() => {
    const e = $(this);
    // part #1: process <a> anchor tags
    process_anchor_tags(e, opts);

    // part #2: process <img>, <object> and <video>/<source> tags
    // make relative links to images use the raw server
    process_media_tags(e, opts as Options2);

    return e;
  });
};
