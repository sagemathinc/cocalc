/*
Convert a *markdown* file to printable form.
*/

import { path_split } from "../generic/misc";

// If true, then a popup was blocked before
// If false, then a popup worked before
// If undefined, do not know.
let BLOCKED: boolean | undefined = undefined;

interface PrintOptions {
  html: string;
  path: string; // must be given if src is empty
  project_id: string; // must be given if src is empty
  font_size?: string;
}

export function print_html(opts: PrintOptions): string {
  const w = window.open(
    "",
    "_blank",
    "menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800"
  );

  if (!w || w.closed === undefined) {
    return blocked_error();
  }
  BLOCKED = false;

  const t = `\
<html lang="en">
    <head>
        <title>${path_split(opts.path).tail}</title>
        <meta name="google" content="notranslate"/>
        <link
            rel         = "stylesheet"
            href        = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
            integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
            crossOrigin = "anonymous" />

        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.35.0/codemirror.min.css" />

        <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.9.0/katex.min.css"
            integrity="sha384-TEMocfGvRuD1rIAacqrknm5BQZ7W7uWitoih+jMNFXQIbNl16bO8OZmylH/Vi/Ei"
            crossorigin="anonymous" />

    </head>
    <body style='font-size:${opts.font_size || "10pt"}; margin:7%'>
        ${opts.html}
    </body>
</html>\
`;
  w.document.write(t);
  w.document.close();
  print_window(w);
/*  const win = w.window as any; // see https://github.com/Microsoft/TypeScript/issues/22917
  if (win.print != null) {
    // Wait until the render is (probably) done, then display print dialog.
    win.setTimeout(() => win.print(), 100);
  } */
  return "";
}

export function print_url(url: string): string {
  const w = window.open(
    url,
    "_blank",
    "menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800"
  );
  if (!w || w.closed === undefined) {
    return blocked_error();
  }
  BLOCKED = false;

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

function blocked_error(): string {
  if (BLOCKED || BLOCKED === undefined) {
    // no history, or known blocked
    BLOCKED = true;
    return "Popup blocked.  Please unblock popups for this site.";
  } else {
    // definitely doesn't block -- this happens when window already opened and printing.
    return "If you have a window already opened printing a document, close it first.";
  }
}


