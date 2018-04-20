/*
This is a renderer using the embed tag, so works with browsers that have a PDF viewer plugin.
*/

import { throttle } from "underscore";

import { Map } from "immutable";

//import { Loading } from "../r_misc";
const { Loading } = require("../r_misc");

import { raw_url } from "./util";

import * as React from "react";

export interface Props {
    project_id: string;
    path: string;
    reload?: number;
}

export class PDFEmbed extends React.Component<Props, {}> {
    render() {
        const src: string = `${raw_url(
            this.props.project_id,
            this.props.path
        )}?param=${this.props.reload}`;
        return (
            <embed
                width={"100%"}
                height={"100%"}
                src={src}
                type={"application/pdf"}
            />
        );
    }
}
