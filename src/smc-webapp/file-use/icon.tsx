/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

import { filename_extension_notilde } from "smc-util/misc";

const { file_icon_class } = require("../editor");

import { Component, React } from "../app-framework";

const { Icon } = require("../r_misc");

interface Props {
  filename: string;
}

export class FileUseIcon extends Component<Props, {}> {
  render() {
    const ext: string = filename_extension_notilde(this.props.filename);
    return <Icon name={file_icon_class(ext)} />;
  }
}
