"use strict";
/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
// Based on https://github.com/giovannicalo/brackets-coffeescript/blob/master/main.js
// modified by William Stein.
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";
    CodeMirror.defineMode("coffeescript2", function (config, parser_config) {
        var constant_list = [
            "false",
            "no",
            "null",
            "off",
            "on",
            "true",
            "undefined",
            "Infinity",
            "NaN"
        ];
        var keyword_list = [
            "and",
            "break",
            "by",
            "catch",
            "class",
            "continue",
            "debugger",
            "delete",
            "do",
            "else",
            "extends",
            "finally",
            "for",
            "if",
            "in",
            "instanceof",
            "is",
            "isnt",
            "loop",
            "new",
            "not",
            "of",
            "or",
            "return",
            "super",
            "switch",
            "then",
            "this",
            "throw",
            "try",
            "typeof",
            "unless",
            "until",
            "when",
            "while",
            "yield"
        ];
        var constant = constant_list.join("|");
        var identifier = "[a-zA-Z\\$_][\\w\\$]*";
        var keyword = keyword_list.join("|");
        var number = "((?:0(?:(?:[bB][01]+)|(?:[oO][0-7]+)|(?:[xX][0-9a-fA-F]+)))|(?:[\\d]*\\.?[\\d]+(?:e[\\+\\-]\\d+)?))";
        var regexp = "\\/((?![*+?\\s])(?:[^\\r\\n\\[/\\\\]|\\\\.|\\[(?:[^\\r\\n\\]\\\\]|\\\\.)*\\])+)\\/";
        var regexp_flag = "\\b(([gimuy])(?![gimuy]*\\2))+\\b";
        var not_identifier = "[^\\w\\$]";
        var not_keyword = "[^a-z]";
        var not_number = "([^0-9a-fA-FoxOX\\+\\-\\.]|\\.{2,})";
        var whitespace = "[\\t ]*";
        var xml_identifier = "[a-zA-Z:_][a-zA-Z0-9:_\\-\\.]*";
        var xml_string = "(?:\"(?:(?:\\\")|[^\"])*\")|(?:'(?:(?:\\\')|[^'])*')";
        var xml_value = "(?:\\{[\\s\\S]*?\\})";
        var xml_element = "<\\/?(" + xml_identifier + ")(?: (?:" + xml_string + "|" + xml_value + "|[^<>\"'])*?)?(?:\\/)?" + whitespace + ">";
        return {
            token: function (stream, state) {
                var highlight = "";
                if (!state.isolated) {
                    if (stream.sol()) {
                        state.isolated = true;
                    }
                    else {
                        stream.backUp(1);
                        if (stream.match(new RegExp("^" + not_identifier), false)) {
                            state.isolated = true;
                        }
                        stream.next();
                    }
                }
                else if (!stream.sol()) {
                    stream.backUp(1);
                    if (!stream.match(new RegExp("^" + not_identifier), false)) {
                        state.isolated = false;
                    }
                    stream.next();
                }
                if (parser_config.cjsx) {
                    if (state.xml_element) {
                        if (stream.match(/^\/?>/)) {
                            state.xml_attribute = false;
                            state.xml_element = false;
                            state.xml_string = false;
                            state.xml_value = false;
                            highlight = "keyword";
                        }
                    }
                    else if ((!state.string_interpolated) && (!state.string_literal) && (!state.regexp) && (!state.regexp_block) && (stream.match(new RegExp("^" + xml_element), false))) {
                        state.xml_element = true;
                        stream.match(new RegExp("<\\/?" + xml_identifier));
                        return "keyword";
                    }
                    if (state.xml_element) {
                        if (state.xml_attribute) {
                            if (stream.match(/^(?:\/>)|[\t=> ]/)) {
                                state.xml_attribute = false;
                                return highlight;
                            }
                            else {
                                highlight = "number";
                            }
                        }
                        else if ((state.isolated) && (!state.xml_string) && (!state.xml_value) && (stream.match(new RegExp("^" + identifier), false))) {
                            state.xml_attribute = true;
                            highlight = "number";
                        }
                        if (stream.match(new RegExp("^" + xml_string))) {
                            return "string";
                        }
                        if (state.xml_value) {
                            if (stream.match(/^\}/)) {
                                state.xml_value = false;
                                return "minus";
                            }
                        }
                        else if (stream.match(new RegExp("^" + xml_value), false)) {
                            state.xml_value = true;
                            highlight = "minus";
                        }
                        if (!state.xml_value) {
                            stream.next();
                            return highlight;
                        }
                    }
                }
                if (state.parameter_list) {
                    if (stream.match(/^\)/, false)) {
                        state.parameter_list = false;
                    }
                }
                else if (stream.match(/^\([^\n\r\(\)]*\)[\t ]*(->|=>)/, false)) {
                    state.parameter_list = true;
                }
                if (state.parameter) {
                    if ((stream.sol()) || (stream.match(new RegExp("^" + not_identifier), false))) {
                        state.parameter = false;
                    }
                    else {
                        highlight = "def";
                    }
                }
                if ((state.parameter_list) && (stream.match(new RegExp("^" + identifier), false))) {
                    state.parameter = true;
                    highlight = "def";
                }
                if ((state.isolated) && (!state.string_interpolated) && (!state.string_literal) && (!state.comment_block) && (!state.comment_line) && (stream.match(new RegExp("^@")))) {
                    state.method = true;
                    return "keyword";
                }
                if (state.keyword) {
                    if ((stream.sol()) || (stream.match(new RegExp("^" + not_keyword), false))) {
                        state.keyword = false;
                    }
                    else {
                        highlight = "keyword";
                    }
                }
                if ((state.isolated) && (stream.match(new RegExp("^(" + keyword + ")(" + not_identifier + "|$)"), false))) {
                    state.keyword = true;
                    highlight = "keyword";
                }
                if (state.constant) {
                    if ((stream.sol()) || (stream.match(new RegExp("^" + not_keyword), false))) {
                        state.constant = false;
                    }
                    else {
                        highlight = "string";
                    }
                }
                if ((state.isolated) && (stream.match(new RegExp("^(" + constant + ")(" + not_identifier + "|$)"), false))) {
                    state.constant = true;
                    highlight = "string";
                }
                if (state.function) {
                    if ((stream.sol()) || (stream.match(/^(:|=)/, false))) {
                        state.function = false;
                    }
                    else {
                        highlight = "def";
                    }
                }
                if (stream.match(new RegExp("^" + identifier + whitespace + "(:|=)" + whitespace + "(\\([^\\n\\r]+\\))?" + whitespace + "(->|=>)"), false)) {
                    state.function = true;
                    highlight = "def";
                }
                if (state.property) {
                    if ((stream.sol()) || (stream.match(/^:/, false))) {
                        state.property = false;
                    }
                    else {
                        highlight = "def";
                    }
                }
                else if ((!state.regexp) && (!state.regexp_block) && (!state.string_interpolated) && (!state.string_literal) && (stream.match(new RegExp("^(" + identifier + "|((\"|')?(?:(?:(?!\\3).)|\\\\\\3)*\\3))" + whitespace + ":"), false))) {
                    state.property = true;
                    highlight = "def";
                }
                if (state.variable) {
                    if ((stream.sol()) || (stream.match(/^[=\[]/, false))) {
                        state.variable = false;
                    }
                    else {
                        highlight = "def";
                    }
                }
                if (stream.match(new RegExp("^" + identifier + "(\\[.*\\])*" + whitespace + "=([^=]|$)"), false)) {
                    state.variable = true;
                    highlight = "def";
                }
                if (state.method) {
                    if ((stream.sol()) || (stream.match(new RegExp("^" + not_identifier), false))) {
                        state.method = false;
                    }
                    else {
                        highlight = "def";
                    }
                }
                if ((stream.match(new RegExp("^\\." + identifier), false))) {
                    state.method = true;
                }
                if (state.number) {
                    if ((stream.sol()) || (stream.match(new RegExp("^" + not_number), false))) {
                        state.number = false;
                    }
                    else {
                        highlight = "number";
                    }
                }
                if ((state.isolated) && (stream.match(new RegExp("^" + number + "(" + not_identifier + "|$)"), false))) {
                    stream.backUp(1);
                    if (!stream.match(/^\.{2,}/, false)) {
                        state.number = true;
                        highlight = "number";
                    }
                    stream.next();
                }
                if (state.string_interpolated) {
                    if ((stream.match(/^\\{2}/, false)) || (stream.match(/^\\"/, false))) {
                        highlight = "string";
                        stream.next();
                    }
                    else if (stream.match(/^"/, false)) {
                        state.string_interpolated = false;
                        highlight = "string";
                    }
                    else {
                        highlight = "string";
                    }
                }
                else if ((!state.comment_block) && (!state.comment_line) && (!state.regexp) && (!state.regexp_block) && (!state.property) && (!state.string_literal) && (stream.match(/^"/, false))) {
                    state.string_interpolated = true;
                    highlight = "string";
                }
                if (state.string_literal) {
                    if ((stream.match(/^\\{2}/, false)) || (stream.match(/^\\'/, false))) {
                        highlight = "string";
                        stream.next();
                    }
                    else if (stream.match(/^'/, false)) {
                        state.string_literal = false;
                        highlight = "string";
                    }
                    else {
                        highlight = "string";
                    }
                }
                else if ((!state.comment_block) && (!state.comment_line) && (!state.regexp) && (!state.regexp_block) && (!state.property) && (!state.string_interpolated) && (stream.match(/^'/, false))) {
                    state.string_literal = true;
                    highlight = "string";
                }
                if (state.regexp_block) {
                    if (stream.match(/^\/{3}/, false)) {
                        state.regexp_block = false;
                        highlight = "string";
                        stream.next();
                        stream.next();
                        stream.next();
                        stream.match(new RegExp("^" + regexp_flag));
                        stream.backUp(1);
                    }
                    else {
                        highlight = "string";
                    }
                }
                else if ((!state.string_interpolated) && (!state.string_literal) && (stream.match(/^\/{3}/, false))) {
                    state.regexp_block = true;
                    highlight = "string";
                }
                if (state.regexp) {
                    if (stream.match(/^\\\\\//, false)) {
                        state.regexp = false;
                        highlight = "string";
                        stream.next();
                        stream.next();
                        stream.next();
                        stream.match(new RegExp("^" + regexp_flag));
                        stream.backUp(1);
                    }
                    else if (stream.match(/^\\\//, false)) {
                        highlight = "string";
                        stream.next();
                    }
                    else if ((stream.sol()) || (stream.match(/^\//, false))) {
                        state.regexp = false;
                        highlight = "string";
                        stream.next();
                        stream.match(new RegExp("^" + regexp_flag));
                        stream.backUp(1);
                    }
                    else {
                        highlight = "string";
                    }
                }
                else if ((!state.regexp_block) && (!state.string_interpolated) && (!state.string_literal) && (stream.match(new RegExp("^" + regexp), false))) {
                    state.regexp = true;
                    highlight = "string";
                }
                if (state.comment_block) {
                    if (stream.match(/^#{3}/, false)) {
                        state.comment_block = false;
                        highlight = "comment";
                        stream.next();
                        stream.next();
                    }
                    else {
                        highlight = "comment";
                    }
                }
                else if ((!state.regexp) && (!state.regexp_block) && (!state.string_interpolated) && (!state.string_literal) && (stream.match(/^#{3}/, false))) {
                    state.comment_block = true;
                    highlight = "comment";
                    stream.next();
                    stream.next();
                }
                if (stream.sol()) {
                    state.comment_line = false;
                }
                if (state.comment_line) {
                    highlight = "comment";
                }
                else if ((!state.comment_block) && (!state.regexp) && (!state.regexp_block) && (!state.string_interpolated) && (!state.string_literal) && (stream.match(/^#/, false))) {
                    if (stream.column() > 1) {
                        stream.backUp(2);
                        if (!stream.match(/^#{3}/, false)) {
                            state.comment_line = true;
                            highlight = "comment";
                        }
                        stream.next();
                        stream.next();
                    }
                    else {
                        state.comment_line = true;
                        highlight = "comment";
                    }
                }
                else if ((state.regexp_block) && (stream.match(/^[\t ]+#/, false))) {
                    state.comment_line = true;
                    highlight = "comment";
                }
                if (state.string_interpolation) {
                    if ((!state.comment_block) && (!state.regexp) && (!state.regexp_block) && (!state.string_interpolated) && (!state.string_literal) && (stream.match(/^\}/, false))) {
                        state.string_interpolation = false;
                        state.string_interpolated = true;
                        highlight = "minus";
                    }
                }
                else if ((state.string_interpolated) && (stream.match(/^#\{/, false))) {
                    state.string_interpolation = true;
                    state.string_interpolated = false;
                    highlight = "minus";
                    stream.next();
                }
                stream.next();
                return highlight;
            },
            startState: function () {
                return {
                    comment_block: false,
                    comment_line: false,
                    constant: false,
                    function: false,
                    isolated: false,
                    keyword: false,
                    method: false,
                    number: false,
                    parameter: false,
                    parameter_list: false,
                    property: false,
                    regexp: false,
                    regexp_block: false,
                    string_interpolated: false,
                    string_interpolation: false,
                    string_literal: false,
                    variable: false,
                    xml_attribute: false,
                    xml_element: false,
                    xml_string: false,
                    xml_value: false
                };
            },
            lineComment: "#",
            fold: "indent"
        };
    });
    CodeMirror.defineMIME("text/cjsx", {
        cjsx: true,
        name: "coffeescript2"
    });
    CodeMirror.defineMIME("text/coffeescript2", {
        cjsx: false,
        name: "coffeescript2"
    });
});
