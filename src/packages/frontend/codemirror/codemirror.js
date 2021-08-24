// This tricky code works in both Node.js *and* the web browser, in a way that
// works with Next.js SSR rendering.  It just tooks hours of careful thought
// and trial and error to figure out.
let CodeMirror;
try {
  // Try to require the full codemirror package.  In the browser via webpack
  // this will work.
  CodeMirror = window.CodeMirror = require("codemirror");
  require("codemirror/addon/runmode/runmode.js");
} catch (err) {
  // In next.js browser or node.js, so we use the node runmode approach,
  // which fully works in both situations.
  // Note that we *have* to define global.CodeMirror in this case
  // since the mode loading won't work otherwise.
  // See ./static.js.
  CodeMirror =
    global.CodeMirror = require("codemirror/addon/runmode/runmode.node");
}

export default CodeMirror;
