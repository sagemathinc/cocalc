/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { CSS } from "../app-framework";

import {
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BackwardOutlined,
  BellFilled,
  BellOutlined,
  BoldOutlined,
  BookOutlined,
  BorderOutlined,
  BulbOutlined,
  CalendarOutlined,
  CaretDownFilled,
  CaretLeftFilled,
  CaretRightFilled,
  CaretUpFilled,
  CheckOutlined,
  CheckSquareOutlined,
  CloudDownloadOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CloudFilled,
  CloudUploadOutlined,
  ClusterOutlined,
  CodeOutlined,
  CoffeeOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  CommentOutlined,
  ControlOutlined,
  CreditCardOutlined,
  CopyOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownCircleOutlined,
  DownOutlined,
  EditOutlined,
  ExpandOutlined,
  ExportOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FacebookOutlined,
  FieldTimeOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  ForwardOutlined,
  FundProjectionScreenOutlined,
  GithubOutlined,
  GlobalOutlined,
  GoogleOutlined,
  HddOutlined,
  HistoryOutlined,
  HourglassOutlined,
  InfoCircleOutlined,
  InfoOutlined,
  ItalicOutlined,
  KeyOutlined,
  LaptopOutlined,
  LeftOutlined,
  LeftSquareFilled,
  LineChartOutlined,
  LineHeightOutlined,
  LinkOutlined,
  LoadingOutlined,
  LockFilled,
  LoginOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MinusCircleOutlined,
  MinusOutlined,
  MinusSquareOutlined,
  OrderedListOutlined,
  PauseCircleOutlined,
  PercentageOutlined,
  PlayCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  PlusSquareOutlined,
  PoweroffOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  RedoOutlined,
  RightCircleFilled,
  RightOutlined,
  RightSquareFilled,
  RocketOutlined,
  SaveOutlined,
  ScissorOutlined,
  SearchOutlined,
  SendOutlined,
  ShareAltOutlined,
  ShoppingCartOutlined,
  ShrinkOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  StopOutlined,
  StrikethroughOutlined,
  TableOutlined,
  ThunderboltOutlined,
  TwitterOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  UpCircleOutlined,
  UpOutlined,
  UploadOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UsergroupAddOutlined,
  UserOutlined,
  VideoCameraOutlined,
  WarningOutlined,
  WifiOutlined,
} from "@ant-design/icons";

import { createFromIconfontCN } from "@ant-design/icons";
const scriptUrl = `${window.app_base_url}/webapp/iconfont.cn/iconfont.js`;
const IconFont = createFromIconfontCN({ scriptUrl });

const FA2ANTD = {
  "align-left": AlignLeftOutlined,
  "align-center": AlignCenterOutlined,
  "align-justify": { IconFont: "align-justify" },
  "align-right": AlignRightOutlined,
  "angle-down": DownOutlined,
  "angle-right": RightOutlined,
  "arrow-circle-o-left": { IconFont: "arrow-circle-o-left" },
  "arrow-circle-down": DownCircleOutlined,
  "arrow-circle-up": UpCircleOutlined,
  "arrow-down": ArrowDownOutlined,
  "arrow-up": ArrowUpOutlined,
  backward: BackwardOutlined,
  bars: { IconFont: "bars" },
  bell: BellFilled,
  "bell-o": BellOutlined,
  blog: { IconFont: "blog" },
  bold: BoldOutlined,
  bolt: ThunderboltOutlined,
  book: BookOutlined,
  briefcase: { IconFont: "briefcase" },
  bullhorn: { IconFont: "bullhorn" },
  calendar: CalendarOutlined,
  "calendar-week": { IconFont: "calendar-week" },
  "calendar-check": { IconFont: "calendar-check" },
  "calendar-times": { IconFont: "calendar-times" },
  "caret-down": CaretDownFilled,
  "caret-left": CaretLeftFilled,
  "caret-right": CaretRightFilled,
  "caret-up": CaretUpFilled,
  "caret-square-left": LeftSquareFilled,
  "caret-square-right": RightSquareFilled,
  "cc-visa": { IconFont: "cc-visa" },
  "cc-discover": { IconFont: "cc-discover" },
  "cc-mastercard": { IconFont: "cc-mastercard" },
  check: CheckOutlined,
  "check-square": CheckSquareOutlined,
  "check-square-o": CheckSquareOutlined,
  "chevron-down": DownOutlined,
  "chevron-left": LeftOutlined,
  "chevron-right": RightOutlined,
  "chevron-circle-right": RightCircleFilled,
  "chevron-up": UpOutlined,
  "circle-notch": LoadingOutlined,
  clipboard: { IconFont: "clipboard" },
  "clipboard-check": { IconFont: "clipboard-check" },
  clone: { IconFont: "clone" },
  cloud: CloudFilled,
  "cloud-download": CloudDownloadOutlined,
  "cloud-download-alt": CloudDownloadOutlined,
  "cloud-upload": CloudUploadOutlined,
  code: { IconFont: "code" },
  CodeOutlined,
  coffee: CoffeeOutlined,
  cog: ControlOutlined,
  cogs: ControlOutlined,
  colors: { IconFont: "colors" },
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  comment: CommentOutlined,
  comments: CommentOutlined,
  compress: ShrinkOutlined,
  copy: CopyOutlined,
  "credit-card": CreditCardOutlined,
  dashboard: DashboardOutlined,
  database: DatabaseOutlined,
  desktop: DesktopOutlined,
  discord: { IconFont: "discord" },
  "dot-circle": { IconFont: "dot-circle" },
  edit: EditOutlined,
  envelope: { IconFont: "envelope" },
  "exclamation-triangle": WarningOutlined,
  expand: ExpandOutlined,
  "external-link-alt": { IconFont: " external-link-alt" },
  eye: EyeOutlined,
  "eye-slash": EyeInvisibleOutlined,
  facebook: FacebookOutlined,
  file: FileOutlined,
  "file-archive": FileZipOutlined,
  "file-alt": FileTextOutlined,
  "file-code": FileTextOutlined,
  "file-image": FileImageOutlined,
  "file-pdf": FilePdfOutlined,
  "folder-open": FolderOpenOutlined,
  files: CopyOutlined,
  "file-export": ExportOutlined,
  folder: FolderOutlined,
  font: { IconFont: "font" },
  forward: ForwardOutlined,
  FundProjectionScreenOutlined,
  gavel: { IconFont: "gavel" },
  gears: ControlOutlined,
  gear: ControlOutlined,
  github: GithubOutlined,
  "git-square": { IconFont: "git-square" },
  global: GlobalOutlined,
  google: GoogleOutlined,
  "graduation-cap": { IconFont: "graduation" },
  "hand-stop": PoweroffOutlined,
  header: { IconFont: "header" },
  hdd: HddOutlined,
  history: HistoryOutlined,
  "horizontal-split": { IconFont: "horizontal-split" },
  "hourglass-half": HourglassOutlined,
  image: { IconFont: "image" },
  "info-circle": InfoCircleOutlined,
  info: InfoOutlined,
  italic: ItalicOutlined,
  "js-square": { IconFont: "js-square" },
  key: KeyOutlined,
  keyboard: { IconFont: "keyboard" },
  laptop: LaptopOutlined,
  leave_conference: { IconFont: "leave_conference" },
  "life-ring": { IconFont: "life-ring" },
  "life-saver": { IconFont: "life-ring" },
  lightbulb: BulbOutlined,
  "line-chart": LineChartOutlined,
  link: LinkOutlined,
  linux: { IconFont: "linux" },
  list: UnorderedListOutlined,
  "list-ul": UnorderedListOutlined,
  "list-alt": UnorderedListOutlined,
  "list-ol": OrderedListOutlined,
  lock: LockFilled,
  magic: { IconFont: "magic" },
  mask: { IconFont: "mask" },
  medkit: MedicineBoxOutlined,
  microchip: { IconFont: "cpu" },
  "minus-circle": MinusCircleOutlined,
  "minus-square": MinusSquareOutlined,
  money: CreditCardOutlined,
  "money-check": { IconFont: "money-check" },
  move: { IconFont: "move" },
  "network-wired": ClusterOutlined,
  "node-js": { IconFont: "node-js" },
  pause: PauseCircleOutlined,
  "paper-plane": SendOutlined,
  paste: { IconFont: "paste" },
  pencil: EditOutlined,
  "pencil-alt": EditOutlined,
  percentage: PercentageOutlined,
  play: PlayCircleOutlined,
  plus: PlusOutlined,
  "plus-circle": PlusCircleOutlined,
  "plus-circle-o": PlusCircleOutlined,
  "plus-square": PlusSquareOutlined,
  "plus-square-o": PlusSquareOutlined,
  PoweroffOutlined,
  print: PrinterOutlined,
  "question-circle": QuestionCircleOutlined,
  "quote-left": { IconFont: "quote-left" },
  redo: RedoOutlined,
  refresh: RedoOutlined,
  repeat: RedoOutlined,
  replace: { IconFont: "find-replace" },
  rocket: RocketOutlined,
  run: { IconFont: "run" },
  save: SaveOutlined,
  scissors: ScissorOutlined,
  search: SearchOutlined,
  "search-minus": MinusOutlined, // we actually use this for zoom
  "search-plus": PlusOutlined,
  "sign-in": LoginOutlined,
  "sign-out-alt": LogoutOutlined,
  sitemap: ClusterOutlined,
  "share-square": ShareAltOutlined,
  "shopping-cart": ShoppingCartOutlined,
  "sort-amount-up": { IconFont: "sort-amount-up" },
  square: BorderOutlined,
  "square-o": BorderOutlined,
  "step-backward": StepBackwardOutlined,
  "step-forward": StepForwardOutlined,
  stop: StopOutlined,
  stopwatch: FieldTimeOutlined,
  store: { IconFont: "store" },
  strikethrough: StrikethroughOutlined,
  subscript: { IconFont: "subscript" },
  superscript: { IconFont: "superscript" },
  support: { IconFont: "life-ring" },
  sync: { IconFont: "sync" },
  tab: { IconFont: "tab" },
  table: TableOutlined,
  "tachometer-alt": DashboardOutlined,
  tasks: { IconFont: "tasks" },
  terminal: CodeOutlined,
  "text-height": LineHeightOutlined,
  times: CloseOutlined,
  "times-circle": CloseCircleOutlined,
  trash: DeleteOutlined,
  twitter: TwitterOutlined,
  underline: UnderlineOutlined,
  undo: UndoOutlined,
  unlink: { IconFont: "unlink" },
  upload: UploadOutlined,
  user: UserOutlined,
  UserAddOutlined,
  "user-check": { IconFont: "user-check" },
  "user-plus": UsergroupAddOutlined,
  "user-slash": { IconFont: "user-slash" },
  "user-times": UserDeleteOutlined,
  users: UsergroupAddOutlined,
  "vertical-split": { IconFont: "vertical-split" },
  "video-camera": VideoCameraOutlined,
  warning: WarningOutlined,
  wifi: WifiOutlined,
  "window-maximize": { IconFont: "window-maximize" },
  "window-restore": DesktopOutlined, //  we only use for x11 and this has big X.
  wrench: { IconFont: "tasks" },
};

interface Props {
  name?: string;
  unicode?: number; // (optional) set a hex 16 bit charcode to render a unicode char, e.g. 0x2620
  className?: string;
  size?: "lg" | "2x" | "3x" | "4x" | "5x";
  rotate?: "45" | "90" | "135" | "180" | "225" | "270" | "315";
  flip?: "horizontal" | "vertical";
  spin?: boolean;
  pulse?: boolean;
  stack?: "1x" | "2x";
  inverse?: boolean;
  style?: CSS;
  onClick?: (event?: React.MouseEvent) => void; // https://fettblog.eu/typescript-react/events/
  onMouseOver?: () => void;
  onMouseOut?: () => void;
}

const UNICODE_STYLE = {
  fontSize: "120%",
  fontWeight: "bold",
  lineHeight: "1",
  verticalAlign: "middle",
} as React.CSSProperties;

/*
log.js?a35c:52 [8.22s Δ 6.46s] ICON TODO --  server
log.js?a35c:52 [8.85s Δ 0.63s] ICON TODO --  square-root-alt
log.js?a35c:52 [8.85s Δ 0s] ICON TODO --  connectdevelop
log.js?a35c:52 [8.85s Δ 0s] ICON TODO --  laugh
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  atom
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  pen
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  git
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  globe
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  tv
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  pen-fancy
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  book-open
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  cube
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  star
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  calculator
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  address-card
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  camera
log.js?a35c:52 [8.86s Δ 0s] ICON TODO --  heartbeat
log.js?a35c:52 [55.6s Δ 46.7s] ICON TODO --  external-link-square
log.js?a35c:52 [59.9s Δ 4.28s] ICON TODO --  play-circle
log.js?a35c:52 [59.9s Δ 0.01s] ICON TODO --  bug
log.js?a35c:52 [1m2s Δ 1.31s] ICON TODO --  exclamation-circle
log.js?a35c:52 [1m16s Δ 14.3s] ICON TODO --  file-text-o
log.js?a35c:52 [1m16s Δ 0s] ICON TODO --  flash
log.js?a35c:52 [1m16s Δ 0.01s] ICON TODO --  external-link
log.js?a35c:52 [1m17s Δ 0.03s] ICON TODO --  laptop-code
log.js?a35c:52 [1m46s Δ 29.9s] ICON TODO --  remove
log.js?a35c:52 [1m47s Δ 0.73s] ICON TODO --  compass
*/



const missing: any = {};
// Converted from https://github.com/andreypopp/react-fa
export const Icon: React.FC<Props> = (props: Props) => {
  if (props.unicode != null) {
    return (
      <span style={UNICODE_STYLE}>{String.fromCharCode(props.unicode!)}</span>
    );
  }

  let name = props.name ?? "square";
  if (name.startsWith("fab ")) {
    name = name.slice(4);
  }
  if (name.startsWith("fa-")) {
    name = name.slice(3);
  }
  let C;
  if (name.startsWith("cc-icon-")) {
    C = { IconFont: name.slice("cc-icon-".length) };
  } else {
    C = FA2ANTD[name];
    if (C == null && name.endsWith("-o")) {
      // try without -o
      C = FA2ANTD[name.slice(0, name.length - 2)];
    }
  }
  if (C != null) {
    if (typeof C.IconFont == "string") {
      // @ts-ignore
      return <IconFont type={"icon-" + C.IconFont} {...props} />;
    }
    return <C {...props} />;
  }
  if (missing[props.name] == null) {
    missing[props.name] = true;
    console.log("ICON TODO -- ", props.name);
  }
  return null;

  /*
  const {
    name: name_prop,
    onClick: onClick_prop,
    size,
    unicode,
    rotate,
    flip,
    spin,
    pulse,
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
  */
};
