/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, Rendered } from "../app-framework";
import { Col } from "../antd-bootstrap";
import { copy } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Links } from "./links";
import { li_style } from "./style";
import { Icon, IconName } from "../components/icon";

interface Props {
  title: string;
  icon: IconName;
  links: Links;
  width: number;
}

export class LinkList extends Component<Props> {
  public static get defaultProps() {
    return { width: 6 };
  }

  private render_link(
    href: string | undefined,
    link: string | Rendered
  ): Rendered {
    if (!href) return;
    const is_target_blank =
      (href != null ? href.indexOf("#") : undefined) !== 0;
    return (
      <a
        target={is_target_blank ? "_blank" : undefined}
        rel={is_target_blank ? "noopener" : undefined}
        href={href}
      >
        {link}
      </a>
    );
  }

  private render_text(
    href: string | undefined,
    text: string | Rendered
  ): Rendered {
    if (!text) return;
    return (
      <span style={{ color: COLORS.GRAY_D }}>
        {href ? <span> &mdash; </span> : undefined}
        {text}
      </span>
    );
  }

  private render_links(): Rendered[] {
    const { commercial } = require("../customize"); // late require since changes after initial load
    const result: Rendered[] = [];
    for (let name in this.props.links) {
      const data = this.props.links[name];
      if (data.commercial && !commercial) {
        continue;
      }
      const style = copy(li_style);
      if (data.bold) {
        style.fontWeight = "bold";
      }
      result.push(
        <div key={name} style={style}>
          <Icon name={data.icon} style={{ width: "1.125em" }} />{" "}
          {this.render_link(data.href, data.link)}
          {this.render_text(data.href, data.text)}
        </div>
      );
    }
    return result;
  }

  private render_title(): Rendered {
    if (!this.props.title) return;
    return (
      <h3>
        <Icon name={this.props.icon} /> {this.props.title}
      </h3>
    );
  }

  public render(): Rendered {
    return (
      <Col md={this.props.width} sm={12}>
        {this.render_title()}
        {this.render_links()}
      </Col>
    );
  }
}
