/*
Convert an *HTML* file (raw url or string content) to printable form.

TODO: refactor with markdown print (?).
*/

import { path_split } from "smc-util/misc2";

//import { HTML } from 'smc-webapp/r_misc';
const { HTML } = require("smc-webapp/r_misc");

//import ReactDOMServer from "react-dom/server";
const ReactDOMServer = require("react-dom/server");

import { React, Redux, redux } from "../../app-framework";

let BLOCKED: boolean | undefined = undefined;

export function popup(url: string, width:number=800, height:number=640): any {
  const w: any = window.open(
    url,
    "_blank",
    `menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=${height},width=${width}`
  );
  if (!w || w.closed === undefined) {
    if (BLOCKED || BLOCKED === undefined) {
      // no history, or known blocked
      BLOCKED = true;
      throw Error("Popup blocked.  Please unblock popups for this site.");
    } else {
      // definitely doesn't block -- this happens when window already opened and printing.
      throw Error(
        "If you have a window already opened printing a document, close it first."
      );
    }
  }
  BLOCKED = false;
  return w;
}

interface PrintOptions {
  value?: string; // string with html; will get processed (e.g., links, math typesetting, etc.) -- meant to go in body
  html?: string; // rendered html string (no post processing done) -- meant to go in body
  src?: string; // if given, just loads that url (default: ''); this is typically a raw URL into a project.
  path?: string; // must be given if src is empty, so can put it in the HTML title and relative links work.
  project_id?: string; // must be given if src is empty
}

// Raises an exception if there is an error.

export function print_html(opts: PrintOptions): void {
  if (!opts.src) opts.src = "";
  let w: any = popup(opts.src);
  if (opts.src == "") {
    if (!opts.project_id || !opts.path) {
      throw Error("BUG project_id and path must be specified if src not given.");
    }
    write_content(w, opts);
  }
  print_window(w);
}

export function print_window(w): void {
  if (w.window.print === null) {
    return;
  }
  const f = () => w.window.print();
  // Wait until the render is (probably) done, then display print dialog.
  w.window.setTimeout(f, 100);
}

function write_content(w, opts: PrintOptions): void {
  if (!opts.path) throw Error("write_content -- path must be defined");
  const split = path_split(opts.path);

  let html: string;
  if (opts.html == null) {
    const props = {
      value: opts.value,
      project_id: opts.project_id,
      file_path: split.head
    };

    const C = React.createElement(
      Redux,
      { redux } as any,
      React.createElement(HTML, props)
    );
    html = ReactDOMServer.renderToStaticMarkup(C);
  } else {
    html = opts.html;
  }
  const title: string = path_split(opts.path).tail;
  html = html_with_deps(html, title);
  w.document.write(html);
  w.document.close();
}

function html_with_deps(
  html: string,
  title: string
): string {
  return `\
<html lang="en">
    <head>
        <title>${title}</title>
        <meta name="google" content="notranslate"/>
        <link
            rel         = "stylesheet"
            href        = "https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.7/css/bootstrap.min.css"
            integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
            crossOrigin = "anonymous" />

        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.40.2/codemirror.min.css"
            integrity="sha256-I8NyGs4wjbMuBSUE40o55W6k6P7tu/7G28/JGUUYCIs="
            crossorigin="anonymous" />

        <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/katex@0.11.1/dist/katex.min.css"
            integrity="sha256-V8SV2MO1FUb63Bwht5Wx9x6PVHNa02gv8BgH/uH3ung="
            crossorigin="anonymous" />

    </head>
    <body style='margin:7%'>
        ${html}
    </body>
</html>\
`;
}
