/*
Show errors and warnings.
*/

import { Map, List } from "immutable";

import { Button } from "react-bootstrap";

import { capitalize, is_different, path_split } from "./misc";

import { Component, React, ReactDOM, rclass, rtypes, Fragment } from "./react";


//import { Icon, Loading } from "../r_misc";
const { Icon, Loading } = require("../r_misc");

function group_to_level(group: string): string {
    switch (group) {
        case "errors":
            return "error";
        case "warnings":
            return "warning";
        default:
            return group;
    }
}

export interface SpecItem {
    icon: string;
    color: string;
}

export interface SpecDesc {
    error: SpecItem;
    typesetting: SpecItem;
    warning: SpecItem;
}

export let SPEC: SpecDesc = {
    error: {
        icon: "bug",
        color: "#a00"
    },
    typesetting: {
        icon: "exclamation-circle",
        color: "rgb(66, 139, 202)"
    },
    warning: {
        icon: "exclamation-triangle",
        color: "#fdb600"
    }
};

const ITEM_STYLES = {
    warning: {
        borderLeft: `2px solid ${SPEC.warning.color}`,
        padding: "15px",
        margin: "5px 0"
    },
    error: {
        borderLeft: `2px solid ${SPEC.error.color}`,
        padding: "15px",
        margin: "5px 0"
    },
    typesetting: {
        borderLeft: `2px solid ${SPEC.typesetting.color}`,
        padding: "15px",
        margin: "5px 0"
    }
};

interface ItemProps {
    actions: any;
    item: Map<any, string>;
};

class Item extends Component<ItemProps, {}> {
    shouldComponentUpdate(props: ItemProps): boolean {
        return this.props.item !== props.item;
    }

    edit_source(e: React.SyntheticEvent<any>): void {
        e.stopPropagation();
        return this.props.actions.open_code_editor({
            line: this.props.item.get("line"),
            file: this.props.item.get("file"),
            cursor: true,
            focus: true,
            direction: "col"
        });
    }

    render_location(): React.ReactElement<any> | undefined {
        if (!this.props.item.get("line")) {
            return;
        }
        return (
            <div>
                <a
                    onClick={this.edit_source}
                    style={{ cursor: "pointer", float: "right" }}
                >
                    Line {this.props.item.get("line")} of{" "}
                    {path_split(this.props.item.get("file")).tail}
                </a>
            </div>
        );
    }

    render_message(): React.ReactElement<any> | undefined {
        const message = this.props.item.get("message");
        if (!message) {
            return;
        }
        return <div>{message}</div>;
    }

    render_content(): React.ReactElement<any> | undefined {
        const content = this.props.item.get("content");
        if (!content) {
            return;
        }
        return <pre>{content}</pre>;
    }

    render(): React.ReactElement<any> {
        return (
            <div style={ITEM_STYLES[this.props.item.get("level")]}>
                {this.render_location()}
                {this.render_message()}
                {this.render_content()}
            </div>
        );
    }
}

export let ErrorsAndWarnings: React.Component = rclass(function({ name }) {
    return {
        displayName: "LaTeXEditor-ErrorsAndWarnings",

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

        reduxProps: {
            [name]: {
                build_log: rtypes.immutable.Map,
                status: rtypes.string
            }
        },

        getDefaultProps() {
            return { build_log: Map() };
        },

        shouldComponentUpdate(props): boolean {
            return (
                is_different(this.props, props, ["status", "font_size"]) ||
                this.props.build_log.getIn(["latex", "parse"]) !=
                    props.build_log.getIn(["latex", "parse"])
            );
        },

        render_status(): React.ReactElement<any> | undefined {
            if (this.props.status) {
                return (
                    <div style={{ margin: "15px" }}>
                        <Loading
                            text={this.props.status}
                            style={{
                                fontSize: "18pt",
                                textAlign: "center",
                                marginTop: "15px",
                                color: "#666"
                            }}
                        />
                    </div>
                );
            }
        },

        render_item(item, key): React.ReactElement<any> {
            return <Item key={key} item={item} actions={this.props.actions} />;
        },

        render_group_content(content): React.ReactElement<any> {
            if (content.size === 0) {
                return <div>None</div>;
            } else {
                const w: React.Component[] = [];
                content.forEach(item => {
                    w.push(this.render_item(item, w.length));
                });
                return <div>{w}</div>;
            }
        },

        render_group(group): React.ReactElement<any> | undefined {
            const spec: SpecItem = SPEC[group_to_level(group)];
            const content = this.props.build_log.getIn([
                "latex",
                "parse",
                group
            ]);
            if (!content) {
                return;
            }
            return (
                <div key={group}>
                    <h3>
                        <Icon name={spec.icon} style={{ color: spec.color }} />{" "}
                        {capitalize(group)}
                    </h3>
                    {this.render_group_content(content)}
                </div>
            );
        },

        render(): React.ReactElement<any> {
            return (
                <div
                    className={"smc-vfill"}
                    style={{
                        overflowY: "scroll",
                        padding: "5px 15px",
                        fontSize: `${this.props.font_size}px`
                    }}
                >
                    {this.render_status()}
                    {["errors", "typesetting", "warnings"].map(group =>
                        this.render_group(group)
                    )}
                </div>
            );
        }
    };
});
