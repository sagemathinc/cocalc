/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { filename_extension_notilde } from "@cocalc/util/misc";
import { file_icon_class } from "../editor-tmp";
import { Component } from "../app-framework";
import { Icon } from "../components";

interface Props {
  filename: string;
}

export class FileUseIcon extends Component<Props, {}> {
  render() {
    const ext: string = filename_extension_notilde(this.props.filename);
    return <Icon name={file_icon_class(ext)} />;
  }
}
