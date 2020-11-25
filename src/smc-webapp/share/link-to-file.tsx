/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a link to a file.
*/

import { path_split } from "smc-util/misc";
import { Component, Rendered, React } from "../app-framework";

interface Props {
  path: string;
  why?: string; // if given, show a message about why only showing a link
}

export class LinkToFile extends Component<Props> {
  private render_link(): Rendered {
    const filename = path_split(this.props.path).tail;
    const href = filename + "?viewer=download";
    return <a href={href}>{filename}</a>;
  }

  private render_why(): Rendered {
    if (this.props.why) return <div>({this.props.why})</div>;
  }

  public render(): Rendered {
    return (
      <div>
        {this.render_link()}
        {this.render_why()}
      </div>
    );
  }
}
