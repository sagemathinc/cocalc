/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// IMPORTANT: we only update this component when the value changes.
// You can't change other things like the style, href_transform function,
// etc.  This is an assumption that makes things much more efficient,
// and should be fine for everything in cocalc.

import { CSSProperties as CSS, useEffect, useRef } from "react";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { is_share_server } from "./share-server";
import { sanitize_html, sanitize_html_safe } from "../misc/sanitize";
import $ from "jquery";

export interface Props {
  value?: string;
  style?: CSS;
  auto_render_math?: boolean; // optional -- used to detect and render math
  preProcessMath?: boolean; // if true (the default), and auto_render_math, also run tex2jax.PreProcess to find math in $'s, etc., instead of only rendering <script type="math/tex"...
  project_id?: string; // optional -- can be used to improve link handling (e.g., to images)
  file_path?: string; // optional -- ...
  className?: string; // optional class

  /* optional -- default true, if true scripts and unsafe attributes are removed
     from sanitized html WARNING!!! ATTN! false does not work / cannot work!! scripts
     will NEVER be run. See commit 1abcd43bd5fff811b5ffaf7c76cb86a0ad494498, which
     I've reverted, since it breaks katex... and on balance if we can get by with
     other approaches to this problem we should since script is dangerous. See also
     https://github.com/sagemathinc/cocalc/issues/4695
  */
  safeHTML?: boolean;

  // optional function that link/src hrefs are fed through
  href_transform?: (string) => string;

  /* optional function post_hook(elt), which should mutate elt, where elt is
     the jQuery wrapped set that is created (and discarded!) in the course of
     sanitizing input.  Use this as an opportunity to modify the HTML structure
     before it is exported to text and given to react.   Obviously, you can't
     install click handlers here.
  */
  post_hook?: (any) => void;

  content_editable?: boolean; // if true, makes rendered HTML contenteditable; otherwise, explicitly set false.

  // If true, after any update to component, force reloading of all images.
  reload_images?: boolean;

  /* If true, after rendering run the smc_image_scaling pluging to handle
     smc-image-scaling= attributes, which are used in smc_sagews to rescale certain
     png images produced by other kernels (e.g., the R kernel). See
     https://github.com/sagemathinc/cocalc/issues/4421. This functionality is NOT
     actually used at all right now, since it doesn't work on the share server
     anyways...
  */
  smc_image_scaling?: boolean;

  // if true, highlight some <code class='language-r'> </code> blocks.
  // this uses a jquery plugin that I wrote that uses codemirror.
  highlight_code?: boolean;

  id?: string;

  onClick?: (event?: any) => void;
  onDoubleClick?: (event?: any) => void;
}

export function HTML({
  value,
  style,
  auto_render_math = true,
  preProcessMath,
  project_id,
  file_path,
  className,
  safeHTML = true,
  href_transform,
  post_hook,
  content_editable,
  reload_images,
  smc_image_scaling,
  highlight_code = true,
  id,
  onClick,
  onDoubleClick,
}: Props) {
  const isMountedRef = useIsMountedRef();
  const ref = useRef<any>(null);

  function jq(): any {
    if (!isMountedRef.current) return;
    const elt = ref.current;
    if (elt == null) {
      return undefined;
    }
    return $(elt);
  }

  function update_mathjax(): void {
    if (!isMountedRef.current) {
      // see https://github.com/sagemathinc/cocalc/issues/1689
      return;
    }
    if (!auto_render_math) {
      return;
    }
    jq()?.katex({ preProcess: preProcessMath ?? true });
  }

  function update_links(): void {
    if (!isMountedRef.current) {
      return;
    }
    jq()?.process_smc_links({
      project_id,
      file_path,
      href_transform,
    });
  }

  function update_tables(): void {
    if (!isMountedRef.current) {
      return;
    }
    jq()?.find("table").addClass("table");
  }

  function update_images(): void {
    if (!isMountedRef.current) {
      return;
    }
    if (reload_images) {
      jq()?.reload_images();
    }
    if (smc_image_scaling) {
      jq()?.smc_image_scaling();
    }
  }

  function update_code(): void {
    if (isMountedRef.current && highlight_code) {
      // note that the highlight_code plugin might not be defined.
      jq()?.highlight_code?.();
    }
  }

  function do_updates(): void {
    if (is_share_server()) {
      return;
    }
    update_mathjax();
    update_links();
    update_tables();
    update_code();
    update_images();
  }

  function update_content(): void {
    if (!isMountedRef.current) {
      return;
    }
    do_updates();
  }

  useEffect(update_content);

  function render_html(): { __html: string } {
    let html;
    if (!value) {
      return { __html: "" };
    }

    if (is_share_server()) {
      /* No sanitization at all for share server.  For now we
         have set things up so that the share server is served
         from a different subdomain and user can't sign into it,
         so XSS is not an issue.  Note that the sanitizing
         in the else below (on non-share server) is expensive and
         can crash on "big" documents (e.g., 500K).
      */
      const elt = $("<div>") as any;
      elt.html(value);
      if (auto_render_math) {
        elt.katex({ preProcess: preProcessMath ?? true });
      }
      elt.find("table").addClass("table");
      if (highlight_code) {
        elt.highlight_code();
      }
      elt.process_smc_links({
        project_id,
        file_path,
        href_transform,
      });
      html = elt.html();
    } else {
      if (safeHTML) {
        html = sanitize_html_safe(value, post_hook);
      } else {
        html = sanitize_html(value, true, true, post_hook);
      }
    }

    return { __html: html };
  }

  /* The random key is the whole span (hence the html) does
     get rendered whenever this component is updated.  Otherwise,
     it will NOT re-render except when the value changes.
  */
  if (content_editable) {
    return (
      <div
        ref={ref}
        id={id}
        contentEditable={true}
        key={Math.random()}
        className={`${className ?? ""} cocalc-html-component`}
        dangerouslySetInnerHTML={render_html()}
        style={style}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      ></div>
    );
  } else {
    return (
      <span
        ref={ref}
        id={id}
        contentEditable={false}
        key={Math.random()}
        className={`${className ?? ""} cocalc-html-component`}
        dangerouslySetInnerHTML={render_html()}
        style={style}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      ></span>
    );
  }
}

// this displayName is assumed and USED in the packages/hub/share/mathjax-support
// to identify this component; do NOT change or remove!!
HTML.displayName = "Misc-HTML";
