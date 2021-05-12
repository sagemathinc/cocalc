"use strict";
/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
Statically render using **React** a non-interactive codemirror
editor, with full support for syntax highlighting (of course)
and *line numbers*. Line numbers are tricky and something which
official codemirror static rendering doesn't have.

TODO: make jupyter/cocdemirror-static a simple wrapper around
this (or get rid of it).
*/
var react_1 = __importDefault(require("react"));
// We use a special version of runMode that can be run on the backend
// or frontend, to better support next.js.
// @ts-ignore -- issue with runMode having any type
var runmode_node_1 = require("codemirror/addon/runmode/runmode.node");
// Here is a VERY IMPORTANT trick that google searching suggests everybody
// screws up to their own detriment.  If we import the modes right after
// runmode on node.js, then
// all the code below to define modes works properly in node.js.  If we
// don't import this, then we get an error "ReferenceError: navigator is
// not defined" resulting from trying to load Codemirror in a certain way
// since it isn't already loaded.
// We can't just import "cocalc-codemirror-core", unfortunately.
require("codemirror/src/addon/runmode/codemirror.node");
require("cocalc-codemirror-core/dist/modes");
var BLURRED_STYLE = {
    width: "100%",
    overflowX: "hidden",
    lineHeight: "normal",
    height: "auto",
    fontSize: "inherit",
    marginBottom: 0,
    padding: "4px",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    wordBreak: "normal",
    border: 0,
};
// This is used heavily by the share server.
function CodeMirrorStatic(_a) {
    var value = _a.value, options = _a.options, fontSize = _a.fontSize, style = _a.style, noBorder = _a.noBorder;
    function lineNumber(key, line, width) {
        return (react_1.default.createElement("div", { key: key, className: "CodeMirror-gutter-wrapper" },
            react_1.default.createElement("div", { style: { left: "-" + (width + 4) + "px", width: width - 9 + "px" }, className: "CodeMirror-linenumber CodeMirror-gutter-elt" }, line)));
    }
    function renderLines(width) {
        var _a;
        // python3 = likely fallback, given it's CoCalc...
        var mode = (_a = options === null || options === void 0 ? void 0 : options["mode"]) !== null && _a !== void 0 ? _a : "python3";
        var v = [];
        var line_numbers = !!(options === null || options === void 0 ? void 0 : options["lineNumbers"]);
        var line = 1;
        if (line_numbers) {
            v.push(lineNumber(v.length, line, width));
            line++;
        }
        var append = function (text, type) {
            if (type != null) {
                v.push(react_1.default.createElement("span", { key: v.length, className: "cm-" + type }, text));
            }
            else {
                v.push(react_1.default.createElement("span", { key: v.length }, text));
            }
            if (line_numbers && text === "\n") {
                v.push(lineNumber(v.length, line, width));
                line++;
            }
        };
        try {
            runmode_node_1.runMode(value, mode, append);
        }
        catch (err) {
            /* This does happen --
                  https://github.com/sagemathinc/cocalc/issues/3626
               However, basically silently ignoring it (with a console.log)
               is probably the best option for now (rather than figuring
               out every possible bad input that could cause this), since
               it completely crashes cocalc. */
            console.log("WARNING: CodeMirror runMode failed -- " + err);
        }
        line_numbers = false;
        append("\n");
        return v;
    }
    function renderCode() {
        var _a;
        var cmstyle;
        var width;
        var theme = (_a = options === null || options === void 0 ? void 0 : options["theme"]) !== null && _a !== void 0 ? _a : "default";
        if (options === null || options === void 0 ? void 0 : options["lineNumbers"]) {
            var num_lines = value.split("\n").length;
            if (num_lines < 100) {
                width = 30;
            }
            else if (num_lines < 1000) {
                width = 35;
            }
            else if (num_lines < 10000) {
                width = 45;
            }
            else {
                width = 69;
            }
            cmstyle = __assign({ paddingLeft: width + 4 + "px" }, BLURRED_STYLE);
            if (style != null) {
                cmstyle = __assign(__assign({}, cmstyle), style);
            }
        }
        else {
            width = 0;
            cmstyle = BLURRED_STYLE;
            if (style != null) {
                cmstyle = __assign(__assign({}, cmstyle), style);
            }
        }
        if (theme == "default") {
            cmstyle = __assign({ background: "white" }, cmstyle);
        }
        var v = theme.split(" ");
        var theme_base = "cm-s-" + v[0];
        var theme_extra = v.length == 2 ? "cm-s-" + v[1] : "";
        return (react_1.default.createElement("pre", { className: "CodeMirror " + theme_base + " " + theme_extra + " CodeMirror-wrap", style: cmstyle },
            react_1.default.createElement("div", { style: { marginLeft: width } },
                renderLines(width),
                renderGutter(width))));
    }
    function renderGutter(width) {
        if (options === null || options === void 0 ? void 0 : options["lineNumbers"]) {
            return (react_1.default.createElement("div", { className: "CodeMirror-gutters" },
                react_1.default.createElement("div", { className: "CodeMirror-gutter CodeMirror-linenumbers", style: { width: width - 1 + "px" } })));
        }
    }
    var divStyle = {
        width: "100%",
        borderRadius: "2px",
        position: "relative",
        overflowX: "auto",
        fontSize: fontSize ? fontSize + "px" : undefined,
    };
    if (!noBorder) {
        divStyle.border = "1px solid rgb(207, 207, 207)";
    }
    return react_1.default.createElement("div", { style: divStyle }, renderCode());
}
exports.default = CodeMirrorStatic;
