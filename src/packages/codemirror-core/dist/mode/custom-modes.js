"use strict";
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sagews_decorator_modes = exports.MARKERS = void 0;
// Multiplex'd worksheet mode
//import { MARKERS } from "smc-util/sagews";
// TODO: once smc-utils sagews is a repo, then import this from there.  This won't change though.
exports.MARKERS = {
    cell: "\uFE20",
    output: "\uFE21",
};
var lodash_1 = require("lodash");
var CodeMirror = __importStar(require("codemirror"));
exports.sagews_decorator_modes = [
    ["cjsx", "text/cjsx"],
    ["coffeescript", "coffeescript"],
    ["cython", "cython"],
    ["file", "text"],
    ["fortran", "text/x-fortran"],
    ["html", "htmlmixed"],
    ["javascript", "javascript"],
    ["java", "text/x-java"],
    ["latex", "stex"],
    ["lisp", "ecl"],
    ["md", "gfm2"],
    ["gp", "text/pari"],
    ["go", "text/x-go"],
    ["perl", "text/x-perl"],
    ["python3", "python"],
    ["python", "python"],
    ["ruby", "text/x-ruby"],
    ["r", "r"],
    ["sage", "python"],
    ["script", "shell"],
    ["sh", "shell"],
    ["julia", "text/x-julia"],
    ["wiki", "mediawiki"],
    ["mediawiki", "mediawiki"],
];
// Many of the modes below are multiplexed
require("codemirror/addon/mode/multiplex.js");
require("./multiplex");
// not using these two gfm2 and htmlmixed2 modes, with their sub-latex mode, since
// detection of math isn't good enough.  e.g., \$ causes math mode and $ doesn't seem to...   \$500 and $\sin(x)$.
CodeMirror.defineMode("gfm2", function (config) {
    var _a;
    var options = [];
    for (var _i = 0, _b = [
        ["$$", "$$"],
        ["$", "$"],
        ["\\[", "\\]"],
        ["\\(", "\\)"],
    ]; _i < _b.length; _i++) {
        var x = _b[_i];
        options.push({
            open: x[0],
            close: x[1],
            mode: CodeMirror.getMode(config, "stex"),
        });
    }
    return (_a = CodeMirror).multiplexingMode.apply(_a, __spreadArrays([CodeMirror.getMode(config, "gfm")], options));
});
CodeMirror.defineMode("htmlmixed2", function (config) {
    var _a;
    var options = [];
    for (var _i = 0, _b = [
        ["$$", "$$"],
        ["$", "$"],
        ["\\[", "\\]"],
        ["\\(", "\\)"],
    ]; _i < _b.length; _i++) {
        var x = _b[_i];
        options.push({
            open: x[0],
            close: x[1],
            mode: CodeMirror.getMode(config, "stex"),
        });
    }
    return (_a = CodeMirror).multiplexingMode.apply(_a, __spreadArrays([CodeMirror.getMode(config, "htmlmixed")], options));
});
CodeMirror.defineMode("stex2", function (config) {
    var _a;
    var options = [];
    for (var _i = 0, _b = ["sagesilent", "sageblock"]; _i < _b.length; _i++) {
        var x = _b[_i];
        options.push({
            open: "\\begin{" + x + "}",
            close: "\\end{" + x + "}",
            mode: CodeMirror.getMode(config, "sagews"),
        });
    }
    options.push({
        open: "\\sage{",
        close: "}",
        mode: CodeMirror.getMode(config, "sagews"),
    });
    return (_a = CodeMirror).multiplexingMode.apply(_a, __spreadArrays([CodeMirror.getMode(config, "stex")], options));
});
CodeMirror.defineMode("rnw", function (config) {
    var block = {
        open: /^<<.+?>>=/,
        close: /^@/,
        mode: CodeMirror.getMode(config, "r"),
    };
    var inline = {
        open: "\\Sexpr{",
        close: "}",
        mode: CodeMirror.getMode(config, "r"),
    };
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "stex2"), block, inline);
});
CodeMirror.defineMode("rtex", function (config) {
    var block = {
        open: /^%%\s+begin\.rcode/,
        close: /^%%\s+end\.rcode/,
        indent: "% ",
        mode: CodeMirror.getMode(config, "r"),
    };
    var inline = {
        open: "\\rinline{",
        close: "}",
        mode: CodeMirror.getMode(config, "r"),
    };
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "stex2"), block, inline);
});
CodeMirror.defineMode("cython", function (config) {
    // FUTURE: need to figure out how to do this so that the name
    // of the mode is cython
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "python"));
});
CodeMirror.defineMode("sagews", function (config) {
    var _a;
    var options = [];
    var close = new RegExp("[" + exports.MARKERS.output + exports.MARKERS.cell + "]");
    for (var _i = 0, sagews_decorator_modes_1 = exports.sagews_decorator_modes; _i < sagews_decorator_modes_1.length; _i++) {
        var x = sagews_decorator_modes_1[_i];
        // NOTE: very important to close on both MARKERS.output *and* MARKERS.cell,
        // rather than just MARKERS.cell, or it will try to
        // highlight the *hidden* output message line, which can
        // be *enormous*, and could take a very very long time, but is
        // a complete waste, since we never see that markup.
        options.push({
            open: "%" + x[0],
            start: true,
            close: close,
            mode: CodeMirror.getMode(config, x[1]),
        });
    }
    return (_a = CodeMirror).cocalcMultiplexingMode.apply(_a, __spreadArrays([CodeMirror.getMode(config, "python")], options));
});
CodeMirror.defineMode("rmd", function (config) {
    var _a;
    // derived from the sagews modes with some additions
    // and removals.
    var modes = lodash_1.fromPairs(exports.sagews_decorator_modes);
    modes["fortran95"] = modes["fortran"];
    modes["octave"] = "octave";
    modes["bash"] = modes["sh"];
    var options = [];
    // blocks (ATTN ruby before r!)
    // all engine modes: names(knitr::knit_engines$get())
    for (var _i = 0, _b = [
        "ruby",
        "r",
        "python",
        "octave",
        "fortran95",
        "fortran",
        "octave",
        "bash",
        "go",
        "julia",
        "perl",
    ]; _i < _b.length; _i++) {
        var name_1 = _b[_i];
        var mode = modes[name_1];
        var open_1 = new RegExp("```\\s*{" + name_1 + "[^}]*?}");
        options.push({
            open: open_1,
            close: "```",
            delimStyle: "gfm",
            mode: CodeMirror.getMode(config, mode),
        });
    }
    // ATTN: this case must come later, it is less specific
    // inline, just `r ...` exists, not for other languages.
    options.push({
        open: "`r",
        close: "`",
        mode: CodeMirror.getMode(config, "r"),
    });
    return (_a = CodeMirror).multiplexingMode.apply(_a, __spreadArrays([CodeMirror.getMode(config, "yaml-frontmatter")], options));
});
