/*
Top-level react component for editing LaTeX documents
*/

import misc from "smc-util/misc";

import { React, rclass, rtypes } from "../smc-react";

import { FormatBar } from "../markdown-editor/format-bar";
import { Editor as BaseEditor, set } from "../code-editor/editor";

import { PDFJS } from "./pdfjs";
import { PDFEmbed } from "./pdf-embed";
import { LaTeXJS } from "./latexjs";
import { PEG } from "./peg";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { Build } from "./build.jsx";
import { ErrorsAndWarnings } from "./errors-and-warnings";

const pdf_path = path => path.slice(0, path.length - 3) + "pdf";

const EDITOR_SPEC = {
    cm: {
        short: "LaTeX",
        name: "LaTeX Source Code",
        icon: "code",
        component: CodemirrorEditor,
        buttons: set([
            "print",
            "decrease_font_size",
            "increase_font_size",
            "save",
            "time_travel",
            "replace",
            "find",
            "goto_line",
            "cut",
            "paste",
            "copy",
            "undo",
            "redo",
            "help"
        ]),
        gutters: ["Codemirror-latex-errors"]
    },

    pdfjs: {
        short: "PDF View",
        name: "PDF View (pdf.js)",
        icon: "file-pdf-o",
        component: PDFJS,
        buttons: set([
            "print",
            "save",
            "reload",
            "decrease_font_size",
            "increase_font_size"
        ]),
        path: pdf_path,
        style: { background: "#525659" }
    },

    error: {
        short: "Errors",
        name: "Errors and Warnings",
        icon: "bug",
        component: ErrorsAndWarnings,
        buttons: set(["reload", "decrease_font_size", "increase_font_size"])
    },

    build: {
        short: "Build",
        name: "Build control",
        icon: "terminal",
        component: Build,
        buttons: set(["reload", "decrease_font_size", "increase_font_size"])
    },

    embed: {
        short: "PDF Embed",
        name: "PDF Embedded Viewer",
        icon: "file-pdf-o",
        buttons: set(["print", "save", "reload"]),
        component: PDFEmbed,
        path: pdf_path
    },

    latexjs: {
        short: "Quick Preview",
        name: "Quick Preview (LaTeX.js)",
        icon: "file-pdf-o",
        component: LaTeXJS,
        buttons: set([
            "print",
            "save",
            "decrease_font_size",
            "increase_font_size"
        ])
    },

    peg: {
        short: "PEG Preview",
        name: "PEG Preview (PEG.js)",
        icon: "file-pdf-o",
        component: PEG,
        buttons: set([
            "print",
            "save",
            "decrease_font_size",
            "increase_font_size"
        ])
    }
};

let Editor = rclass(function({ name }) {
    return {
        displayName: "LaTeX-Editor",

        propTypes: {
            actions: rtypes.object.isRequired,
            path: rtypes.string.isRequired,
            project_id: rtypes.string.isRequired
        },

        reduxProps: {
            account: {
                editor_settings: rtypes.immutable
            },
            [name]: {
                is_public: rtypes.bool,
                format_bar: rtypes.immutable.Map
            }
        }, // optional extra state of the format bar, stored in the Store

        shouldComponentUpdate(next) {
            return (
                this.props.editor_settings?.get("extra_button_bar") !==
                    next.editor_settings?.get("extra_button_bar") ||
                this.props.format_bar !== next.format_bar
            );
        },

        render_format_bar() {
            if (
                this.props.editor_settings?.get("extra_button_bar") &&
                !this.props.is_public
            ) {
                return (
                    <FormatBar
                        actions={this.props.actions}
                        store={this.props.format_bar}
                        extension={"tex"}
                    />
                );
            }
        },

        render_editor() {
            return (
                <BaseEditor
                    name={name}
                    actions={this.props.actions}
                    path={this.props.path}
                    project_id={this.props.project_id}
                    editor_spec={EDITOR_SPEC}
                />
            );
        },

        render() {
            return (
                <div className="smc-vfill">
                    {this.render_format_bar()}
                    {this.render_editor()}
                </div>
            );
        }
    };
});

export { Editor };
