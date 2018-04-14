/*
Make it so Codemirror has an option to automatically close LaTeX environments.

Inspired a little bit by
  - https://codemirror.net/demo/closetag.html
  - https://codemirror.net/addon/edit/closetag.js
*/

import { splitlines } from "smc-util/misc";

CodeMirror.defineOption("autoCloseLatex", false, function(cm, val, old) {
    if (old && old !== CodeMirror.Init) {
        cm.removeKeyMap("autoCloseLatex");
    }
    if (!val) {
        return;
    }
    const map = {
        name: "autoCloseLatex",
        Enter: function(cm) {
            return auto_close_latex(cm);
        }
    };
    cm.addKeyMap(map);
});

function auto_close_latex(cm) {
    if (cm.getOption("disableInput")) {
        return CodeMirror.Pass;
    }
    const replacements = [];
    const selections = [];
    let did_subs = false;
    let extra_lines = 0;

    const no_op = function(pos) {
        replacements.push("\n");
        const new_pos = { line: pos.line + 1, ch: 0 };
        extra_lines += 1;
        selections.push({ head: new_pos, anchor: new_pos });
    };

    for (let range of cm.listSelections()) {
        if (!range.empty()) {
            // if any range is non-empty do nothing.
            return CodeMirror.Pass;
        }
        const pos = range.head;
        const tok = cm.getTokenAt(pos);
        const inner = CodeMirror.innerMode(cm.getMode(), tok.state);
        const { state } = inner;
        if (inner.mode.name !== "stex") {
            no_op(pos);
            continue;
        }
        if (tok.type !== "bracket" && tok.string !== "}") {
            no_op(pos);
            continue;
        }
        const next_token = cm.getTokenAt({ line: pos.line, ch: pos.ch + 1 });
        if (next_token.start !== tok.start) {
            //has to be end of line.
            no_op(pos);
            continue;
        }

        const line = cm.getLine(pos.line);
        let i = line.lastIndexOf("\\begin{");
        if (i === -1) {
            no_op(pos);
            continue;
        }
        const environment = line.slice(i + "\\begin{".length, pos.ch - 1);
        const end = `\\end{${environment}}`;
        const s = cm.getRange(
            { line: pos.line + 1, ch: 0 },
            { line: pos.line + 1000, ch: 0 }
        );
        i = s.indexOf(`\\end{${environment}}`);
        const j = s.indexOf(`\\begin{${environment}}`);
        if (i !== -1 && (j === -1 || j > i)) {
            no_op(pos);
            continue;
        }
        const middle = extra_content(environment);
        replacements.push(`${middle}\n${end}\n`);
        const new_pos = { line: pos.line + extra_lines + 1, ch: middle.length };
        extra_lines +=
            splitlines(replacements[replacements.length - 1]).length + 1;
        selections.push({ head: new_pos, anchor: new_pos });
        did_subs = true;
    }

    if (did_subs) {
        // now make all the replacements
        cm.replaceSelections(replacements);
        // TODO: selections aren't quite right with multiple ones...
        cm.setSelections(selections);
    } else {
        return CodeMirror.Pass;
    }
}

// See http://latex.wikia.com/wiki/List_of_LaTeX_environments for inspiration.
var extra_content = function(environment) {
    switch (environment) {
        case "enumerate":
        case "itemize":
        case "list":
            return "\n\\item First \n\\item Second ";
        case "description":
            return "\n\\item [label] First \n\\item [label] Second ";
        case "figure":
            return "\n% body of the figure\n\\caption{figure title}";
        default:
            return "\n";
    }
};
