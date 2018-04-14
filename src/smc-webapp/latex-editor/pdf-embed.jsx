/*
This is a renderer using the embed tag, so works with browsers that have a PDF viewer plugin.
*/

import { throttle } from "underscore";

import { React, ReactDOM, rclass, rtypes } from "../smc-react";

import { Loading } from "../r_misc";

import { raw_url } from "../code-editor/util";

export let PDFEmbed = rclass({
    displayName: "LaTeXEditor-PDFEmbed",

    propTypes: {
        id: rtypes.string.isRequired,
        actions: rtypes.object.isRequired,
        editor_state: rtypes.immutable.Map,
        is_fullscreen: rtypes.bool,
        project_id: rtypes.string,
        path: rtypes.string,
        reload: rtypes.number,
        font_size: rtypes.number
    },

    render() {
        const src = `${raw_url(this.props.project_id, this.props.path)}?param=${
            this.props.reload
        }`;
        return (
            <embed
                width={"100%"}
                height={"100%"}
                src={src}
                type={"application/pdf"}
            />
        );
    }
});
