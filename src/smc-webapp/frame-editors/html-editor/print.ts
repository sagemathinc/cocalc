/*
Convert an *HTML* file to printable form.

TODO: refactor with markdown print (?).
*/

import { path_split } from "../generic/misc";

//import { HTML } from 'smc-webapp/r_misc';
const { HTML } = require("smc-webapp/r_misc");

//import ReactDOMServer from "react-dom/server";
const ReactDOMServer = require("react-dom/server");

import { React, Redux, redux } from "../generic/react";

let BLOCKED: boolean | undefined = undefined;

interface PrintOptions {
  value?: string; // one of value or html or src must be given; html is best....
  html?: string;
  src: string; // if given URL and nonempty, just loads that url
  path?: string; // must be given if src is empty
  project_id?: string; // must be given if src is empty
  font_size?: string;
}

export function print_html(opts : PrintOptions): string {
  const w = window.open(
    opts.src,
    "_blank",
    "menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800"
  );
  if (!w || w.closed === undefined) {
    if (BLOCKED || BLOCKED === undefined) {
      // no history, or known blocked
      BLOCKED = true;
      return "Popup blocked.  Please unblock popups for this site.";
    } else {
      // definitely doesn't block -- this happens when window already opened and printing.
      return "If you have a window already opened printing a document, close it first.";
    }
  }
  BLOCKED = false;

  if(opts.font_size === undefined) {
    opts.font_size = '10pt';
  }
  if (!opts.src) {
    if (!opts.project_id || !opts.path) {
      return "BUG project_id and path must be specified if src not given.";
    }
    write_content(w, opts);
  }
  print_window(w);
  return "";
}

function print_window(w): void {
  if (w.window.print === null) {
    return;
  }
  const f = () => w.window.print();
  // Wait until the render is (probably) done, then display print dialog.
  w.window.setTimeout(f, 100);
}

function write_content(w, opts: PrintOptions) : void {
  if(!opts.path)
    throw Error("write_content -- path must be defined");
  const split = path_split(opts.path);

  let html : string;
  if (opts.html == null) {
    const props = {
      value: opts.value,
      project_id: opts.project_id,
      file_path: split.head
    };

    const C = React.createElement(
      Redux,
      { redux },
      React.createElement(HTML, props)
    );
    html = ReactDOMServer.renderToStaticMarkup(C);
  } else {
    html = opts.html;
  }
  w.document.write(html);
  w.document.close();
}
