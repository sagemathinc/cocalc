// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function(CodeMirror) {
    "use strict";

    console.log("registering helper fold stex");
    CodeMirror.registerHelper("fold", "stex", function(cm, start) {
        console.log("fold stex ", cm, start);

        var line = cm.getLine(start.line);
        if (line.slice(0,8) == "\\section") {
            console.log("is section");
            var lastLineNo = cm.lastLine();
            var i = start.line + 1;
            while (i<=lastLineNo) {
                if (cm.getLine(i).slice(0,8) == "\\section") {
                    i -= 1;
                    break;
                }
                i += 1;
            }
            if (i>lastLineNo) {
                i = lastLineNo;
            }
            var a =  {
                from: CodeMirror.Pos(start.line, line.length),
                to: CodeMirror.Pos(i, cm.getLine(i).length)
            };
            console.log("return a=",a);
            return a;
        } else
        {
            console.log("stex fold: nothing");
            return undefined;
        }


    });
});