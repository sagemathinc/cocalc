/*
Manage codemirror gutters that highlight latex typesetting issues.

NOTE: If there are multiple errors/warnings/etc., on the SAME line, only the last
one gets a gutter mark, with pref to errors.  The main error log shows everything, so this should be OK.
*/

import { required, defaults, path_split, capitalize } from "smc-util/misc";

import { React } from "../smc-react";
import { Icon, Tip } from "../r_misc";

import { SPEC } from "./errors-and-warnings";

export function update_gutters(opts) {
    opts = defaults(opts, {
        path: required,
        log: required,
        set_gutter: required
    });
    let path = path_split(opts.path).tail;
    for (let group of ["typesetting", "warnings", "errors"]) {
        // errors last so always shown if multiple issues on a single line!
        for (let item of opts.log[group]) {
            if (path_split(item.file).tail !== path) {
                /* for now only show gutter marks in the master file. */
                continue;
            }
            if (item.line == null) {
                /* no gutter mark in a line if there is no line number, e.g., "there were missing refs" */
                continue;
            }
            opts.set_gutter(
                item.line - 1,
                component(item.level, item.message, item.content)
            );
        }
    }
}

function component(level, message, content) {
    const spec = SPEC[level];
    if (!content) {
        content = message;
        message = capitalize(level);
    }
    // NOTE/BUG: despite allow_touch true below, this still does NOT work on my iPad -- we see the icon, but nothing
    // happens when clicking on it; this may be a codemirror issue.
    return (
        <Tip
            title={message ? message : ""}
            tip={content ? content : ""}
            placement={"bottom"}
            icon={spec.icon}
            stable={true}
            popover_style={{
                marginLeft: "10px",
                border: `2px solid ${spec.color}`
            }}
            delayShow={0}
            allow_touch={true}
        >
            <Icon
                name={spec.icon}
                style={{ color: spec.color, cursor: "pointer" }}
            />
        </Tip>
    );
}