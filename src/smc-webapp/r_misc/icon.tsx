/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { CSS } from "../app-framework";

import {
  BellFilled,
  BellOutlined,
  BoldOutlined,
  BorderOutlined,
  CaretDownFilled,
  CaretLeftFilled,
  CaretRightFilled,
  CaretUpFilled,
  CheckSquareOutlined,
  CloudDownloadOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CodeOutlined,
  CommentOutlined,
  ControlOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExpandOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LeftOutlined,
  LeftSquareFilled,
  LockFilled,
  LogoutOutlined,
  MedicineBoxOutlined,
  MinusCircleOutlined,
  MinusSquareOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusCircleFilled,
  PlusCircleOutlined,
  PlusSquareFilled,
  PlusSquareOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  RightSquareFilled,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShrinkOutlined,
  SlidersOutlined,
  StopOutlined,
  StrikethroughOutlined,
  UpOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UsergroupAddOutlined,
  UserOutlined,
  WifiOutlined,
} from "@ant-design/icons";

const FA2ANTD = {
  bell: BellFilled,
  "bell-o": BellOutlined,
  bold: BoldOutlined,
  "caret-down": CaretDownFilled,
  "caret-left": CaretLeftFilled,
  "caret-right": CaretRightFilled,
  "caret-up": CaretUpFilled,
  "caret-square-left": LeftSquareFilled,
  "caret-square-right": RightSquareFilled,
  "check-square": CheckSquareOutlined,
  "check-square-o": CheckSquareOutlined,
  "chevron-down": DownOutlined,
  "chevron-left": LeftOutlined,
  "chevron-right": RightOutlined,
  "chevron-up": UpOutlined,
  "cloud-download": CloudDownloadOutlined,
  "cloud-download-alt": CloudDownloadOutlined,
  cogs: ControlOutlined,
  comment: CommentOutlined,
  comments: CommentOutlined,
  compress: ShrinkOutlined,
  copy: CopyOutlined,
  edit: EditOutlined,
  expand: ExpandOutlined,
  eye: EyeOutlined,
  "eye-slash": EyeInvisibleOutlined,
  "folder-open-o": FolderOpenOutlined,
  gears: ControlOutlined,
  history: HistoryOutlined,
  "info-circle": InfoCircleOutlined,
  key: KeyOutlined,
  lock: LockFilled,
  mask: FilterOutlined,
  medkit: MedicineBoxOutlined,
  microchip: SlidersOutlined,
  "minus-circle": MinusCircleOutlined,
  "minus-square": MinusSquareOutlined,
  pause: PauseCircleOutlined,
  play: PlayCircleOutlined,
  "plus-circle": PlusCircleFilled,
  "plus-circle-o": PlusCircleOutlined,
  "plus-square": PlusSquareFilled,
  "plus-square-o": PlusSquareOutlined,
  "question-circle": QuestionCircleOutlined,
  search: SearchOutlined,
  "sign-out-alt": LogoutOutlined,
  "share-square": ShareAltOutlined,
  square: BorderOutlined,
  "square-o": BorderOutlined,
  stop: StopOutlined,
  strikethrough: StrikethroughOutlined,
  terminal: CodeOutlined,
  times: CloseOutlined,
  "times-circle": CloseCircleOutlined,
  trash: DeleteOutlined,
  user: UserOutlined,
  UserAddOutlined,
  "user-plus": UsergroupAddOutlined,
  "user-times": UserDeleteOutlined,
  users: UsergroupAddOutlined,
  wifi: WifiOutlined,
  wrench: SettingOutlined,
};

// TODO:  play square-o book upload eye-slash mask life-saver caret-down check fa-file-code-o cloud-download fa-terminal fa-question-circle fa-file-pdf-o cc-icon-tex-file fa-comment fa-graduation-cap fa-file-image-o cc-icon-sagemath-file fa-window-restore bullhorn cc-icon-r fa-tasks cc-icon-markdown cc-icon-python cc-icon-sagemath-bold folder file cc-icon-jupyter window-restore comment graduation-cap tasks stopwatch cloud cloud-upload lock save search-minus search-plus undo repeat scissors paste fa-sitemap print align-right magic columns plus arrow-up arrow-down step-forward stop refresh forward keyboard-o hand-stop-o slideshare info user-clock circle-o compress trash-o pencil clone arrows files-o share-square-o arrow-circle-o-left minus-square-o eye user  rocket door-open file-code-o file-image-o file-pdf-o file-alt dashboard arrow-circle-up key redo shopping-cart clipboard warning list-ul life-ring bars database clipboard-check check-square user-times gears hdd list-alt table file-text-o flash external-link header envelope share-square laptop-code cogs share-alt video-camera chevron-circle-right money google gear tachometer-alt credit-card fab fa-cc-visa external-link-alt line-chart paper-plane-o fa-stopwatch at bell

interface Props {
  name?: string;
  unicode?: number; // (optional) set a hex 16 bit charcode to render a unicode char, e.g. 0x2620
  className?: string;
  size?: "lg" | "2x" | "3x" | "4x" | "5x";
  rotate?: "45" | "90" | "135" | "180" | "225" | "270" | "315";
  flip?: "horizontal" | "vertical";
  fixedWidth?: boolean;
  spin?: boolean;
  pulse?: boolean;
  stack?: "1x" | "2x";
  inverse?: boolean;
  Component?: JSX.Element | JSX.Element[];
  style?: CSS;
  onClick?: (event?: React.MouseEvent) => void; // https://fettblog.eu/typescript-react/events/
  onMouseOver?: () => void;
  onMouseOut?: () => void;
}

// Converted from https://github.com/andreypopp/react-fa
export const Icon: React.FC<Props> = (props: Props) => {
  if (props.name != null) {
    const C = FA2ANTD[props.name];
    if (C != null) {
      return <C {...props} />;
    }
  }

  const {
    name: name_prop,
    onClick: onClick_prop,
    size,
    unicode,
    rotate,
    flip,
    spin,
    pulse,
    fixedWidth,
    stack,
    inverse,
    className,
    onMouseOver,
    onMouseOut,
    style,
  } = props;
  let name = name_prop ?? "square-o";
  const onClick = onClick_prop ?? undefined;

  function render_unicode() {
    const style: CSS = {
      fontSize: "120%",
      fontWeight: "bold",
      lineHeight: "1",
      verticalAlign: "middle",
    };
    // we know unicode is not undefined, see render_icon
    return <span style={style}>{String.fromCharCode(unicode!)}</span>;
  }

  function render_icon() {
    if (unicode != null) {
      return render_unicode();
    }

    let classNames;

    let i = name.indexOf("cc-icon");

    if (i !== -1 && spin) {
      // Temporary workaround because cc-icon-cocalc-ring is not a font awesome JS+SVG icon, so
      // spin, etc., doesn't work on it.  There is a discussion at
      // https://stackoverflow.com/questions/19364726/issue-making-bootstrap3-icon-spin
      // about spinning icons, but it's pretty subtle and hard to get right, so I hope
      // we don't have to implement our own.  Also see
      // "Icon animation wobble foibles" at https://fontawesome.com/how-to-use/web-fonts-with-css
      // where they say "witch to the SVG with JavaScript version, it's working a lot better for this".
      name = "fa-circle-notch";
      i = -1;
    }

    if (i !== -1) {
      // A custom Cocalc font icon.  Don't even bother with font awesome at all!
      classNames = name.slice(i);
    } else {
      const left = name.slice(0, 3);
      if (left === "fas" || left === "fab" || left === "far") {
        // version 5 names are different!  https://fontawesome.com/how-to-use/use-with-node-js
        // You give something like: 'fas fa-blah'.
        classNames = name;
      } else {
        // temporary until file_associations can be changed
        if (name.slice(0, 3) === "cc-" && name !== "cc-stripe") {
          classNames = `fab ${name}`;
          // the cocalc icon font can't do any extra tricks
        } else {
          // temporary until file_associations can be changed
          if (name.slice(0, 3) === "fa-") {
            classNames = `fa ${name}`;
          } else {
            classNames = `fa fa-${name}`;
          }
        }
      }
      // These only make sense for font awesome.
      if (size) {
        classNames += ` fa-${size}`;
      }
      if (rotate) {
        classNames += ` fa-rotate-${rotate}`;
      }
      if (flip) {
        classNames += ` fa-flip-${flip}`;
      }
      if (fixedWidth) {
        classNames += " fa-fw";
      }
      if (spin) {
        classNames += " fa-spin";
      }
      if (pulse) {
        classNames += " fa-pulse";
      }
      if (stack) {
        classNames += ` fa-stack-${stack}`;
      }
      if (inverse) {
        classNames += " fa-inverse";
      }
    }

    if (className) {
      classNames += ` ${className}`;
    }
    return <i className={classNames} />;
  }

  // Wrap in a span for **two** reasons.
  // 1. A reasonable one -- have to wrap the i, since when rendered using js and svg by new fontawesome 5,
  // the click handlers of the <i> object are just ignored, since it is removed from the DOM!
  // This is important the close button on tabs.
  // 2. An evil one -- FontAwesome's javascript mutates the DOM.  Thus we put a random key in so,
  // that React just replaces the whole part of the DOM where the SVG version of the icon is,
  // and doesn't get tripped up by this.   A good example where this is used is when *running* Jupyter
  // notebooks.
  return (
    <span
      onClick={onClick}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      key={Math.random()}
      style={style}
    >
      {render_icon()}
    </span>
  );
};
