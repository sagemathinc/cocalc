/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { filename_extension_notilde } from "smc-util/misc";

const { file_icon_class } = require("../editor");

import { Component, React } from "../app-framework";

import { Icon } from "../r_misc";

interface Props {
  filename: string;
}

export class FileUseIcon extends Component<Props, {}> {
  render() {
    const ext: string = filename_extension_notilde(this.props.filename);
    return <Icon name={file_icon_class(ext)} />;
  }
}
