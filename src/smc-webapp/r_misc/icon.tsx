/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var DEBUG: boolean; // comes from webpack.

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
  BugOutlined,
  BulbOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CameraOutlined,
  CaretDownFilled,
  CaretLeftFilled,
  CaretRightFilled,
  CaretUpFilled,
  CheckOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CloseCircleOutlined,
  CloseCircleTwoTone,
  CloseOutlined,
  CloudFilled,
  CloudUploadOutlined,
  ClusterOutlined,
  CodeOutlined,
  CoffeeOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  CommentOutlined,
  CompassOutlined,
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
  ExclamationCircleFilled,
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
  IdcardOutlined,
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
  PlayCircleFilled,
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
  StrikethroughOutlined,
  SyncOutlined,
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

// Icon Fonts coming from https://www.iconfont.cn/?lang=en-us
import { createFromIconfontCN } from "@ant-design/icons";
const scriptUrl = `${window.app_base_url}/webapp/iconfont.cn/iconfont.js`;
const IconFont = createFromIconfontCN({ scriptUrl });

const FA2ANTD = {
  "address-card": IdcardOutlined,
  "align-left": AlignLeftOutlined,
  "align-center": AlignCenterOutlined,
  "align-justify": { IconFont: "align-justify" },
  "align-right": AlignRightOutlined,
  "angle-down": DownOutlined,
  "angle-right": RightOutlined,
  "arrow-circle-o-left": { IconFont: "arrowcircleoleft" },
  "arrow-circle-down": DownCircleOutlined,
  "arrow-circle-up": UpCircleOutlined,
  "arrow-down": ArrowDownOutlined,
  "arrow-up": ArrowUpOutlined,
  atom: { IconFont: "Atom" },
  backward: BackwardOutlined,
  bars: { IconFont: "bars" },
  bell: BellFilled,
  "bell-o": BellOutlined,
  blog: { IconFont: "blog" },
  bold: BoldOutlined,
  bolt: ThunderboltOutlined,
  book: BookOutlined,
  briefcase: { IconFont: "briefcase" },
  brush: { IconFont: "brush" },
  bullhorn: { IconFont: "bullhorn" },
  bug: BugOutlined,
  calculator: CalculatorOutlined,
  calendar: CalendarOutlined,
  "calendar-week": { IconFont: "calendar-week" },
  "calendar-check": { IconFont: "calendar-check" },
  "calendar-times": { IconFont: "calendar-times" },
  camera: CameraOutlined,
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
  "check-circle": CheckCircleOutlined,
  "check-square": CheckSquareOutlined,
  "check-square-o": CheckSquareOutlined,
  "chevron-down": DownOutlined,
  "chevron-left": LeftOutlined,
  "chevron-right": RightOutlined,
  "chevron-circle-right": RightCircleFilled,
  "chevron-up": UpOutlined,
  circle: { IconFont: "circle" },
  "circle-notch": LoadingOutlined,
  clipboard: { IconFont: "clipboard" },
  "clipboard-check": { IconFont: "clipboard-check" },
  "close-circle-two-tone": CloseCircleTwoTone,
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
  compass: CompassOutlined,
  compress: ShrinkOutlined,
  copy: CopyOutlined,
  "credit-card": CreditCardOutlined,
  csv: { IconFont: "csv" },
  cube: { IconFont: "cube" },
  dashboard: DashboardOutlined,
  database: DatabaseOutlined,
  desktop: DesktopOutlined,
  discord: { IconFont: "discord" },
  "dot-circle": { IconFont: "dot-circle" },
  edit: EditOutlined,
  envelope: { IconFont: "envelope" },
  exchange: { IconFont: "exchange" },
  "exclamation-circle": ExclamationCircleFilled,
  "exclamation-triangle": WarningOutlined,
  expand: ExpandOutlined,
  "external-link": { IconFont: "external-link-alt" },
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
  flash: ThunderboltOutlined,
  "flow-chart": { IconFont: "flow-chart" },
  folder: FolderOutlined,
  font: { IconFont: "font" },
  forward: ForwardOutlined,
  FundProjectionScreenOutlined,
  gavel: { IconFont: "gavel" },
  gears: ControlOutlined,
  gear: ControlOutlined,
  github: GithubOutlined,
  git: { IconFont: "git1" },
  "git-square": { IconFont: "git-square" },
  global: GlobalOutlined,
  emacs: { IconFont: "gnuemacs" },
  google: GoogleOutlined,
  "graduation-cap": { IconFont: "graduation" },
  grass: { IconFont: "grass" },
  "hand-stop": PoweroffOutlined,
  header: { IconFont: "header" },
  hdd: HddOutlined,
  history: HistoryOutlined,
  "horizontal-split": { IconFont: "horizontal-split" },
  "hourglass-half": HourglassOutlined,
  image: { IconFont: "image" },
  "info-circle": InfoCircleOutlined,
  indent: { IconFont: "indent" },
  info: InfoOutlined,
  inkscape: { IconFont: "inkscape" },
  italic: ItalicOutlined,
  "js-square": { IconFont: "js-square" },
  key: KeyOutlined,
  keyboard: { IconFont: "keyboard" },
  laptop: LaptopOutlined,
  leave_conference: { IconFont: "leave_conference" },
  libreoffice: { IconFont: "libreoffice" },
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
  outdent: { IconFont: "outdent" },
  pause: PauseCircleOutlined,
  "paper-plane": SendOutlined,
  paste: { IconFont: "paste" },
  pencil: EditOutlined,
  "pencil-alt": EditOutlined,
  percentage: PercentageOutlined,
  play: PlayCircleOutlined,
  "play-circle": PlayCircleFilled,
  plus: PlusOutlined,
  "plus-circle": PlusCircleOutlined,
  "plus-circle-o": PlusCircleOutlined,
  "plus-square": PlusSquareOutlined,
  "plus-square-o": PlusSquareOutlined,
  PoweroffOutlined,
  print: PrinterOutlined,
  qgis: { IconFont: "qgis" },
  "question-circle": QuestionCircleOutlined,
  "quote-left": { IconFont: "quote-left" },
  racket: { IconFont: "racket" },
  redo: RedoOutlined,
  refresh: RedoOutlined,
  remove: CloseOutlined,
  repeat: RedoOutlined,
  replace: { IconFont: "find-replace" },
  rocket: RocketOutlined,
  run: { IconFont: "run" },
  save: SaveOutlined,
  scheme: { IconFont: "scheme" },
  scissors: ScissorOutlined,
  search: SearchOutlined,
  "search-minus": MinusOutlined, // we actually use this for zoom
  "search-plus": PlusOutlined,
  server: CloudServerOutlined,
  "sign-in": LoginOutlined,
  "sign-out-alt": LogoutOutlined,
  sitemap: ClusterOutlined,
  "share-square": ShareAltOutlined,
  "shopping-cart": ShoppingCartOutlined,
  "sort-amount-up": { IconFont: "sort-amount-up" },
  square: BorderOutlined,
  "square-o": BorderOutlined,
  "square-root-alt": { IconFont: "square-root-alt" },
  "step-backward": StepBackwardOutlined,
  "step-forward": StepForwardOutlined,
  stop: { IconFont: "stop" }, // the ant-design "stop" looks weird.
  stopwatch: FieldTimeOutlined,
  store: { IconFont: "store" },
  strikethrough: StrikethroughOutlined,
  subscript: { IconFont: "subscript" },
  sun: { IconFont: "sun" },
  superscript: { IconFont: "superscript" },
  support: { IconFont: "life-ring" },
  sync: { IconFont: "sync" },
  "sync-alt": SyncOutlined,
  tab: { IconFont: "tab" },
  table: TableOutlined,
  "tachometer-alt": DashboardOutlined,
  tasks: { IconFont: "tasks" },
  terminal: CodeOutlined,
  tex: { IconFont: "tex" },
  "text-height": LineHeightOutlined,
  times: CloseOutlined,
  "times-circle": CloseCircleOutlined,
  "thumbs-up": { IconFont: "thumbs-up" },
  "toggle-off": { IconFont: "toggle-off" },
  "toggle-on": { IconFont: "toggle-on" },
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
  vim: { IconFont: "vim" },
  vscode: { IconFont: "vscode" },
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
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const UNICODE_STYLE = {
  fontSize: "120%",
  fontWeight: "bold",
  lineHeight: "1",
  verticalAlign: "middle",
} as React.CSSProperties;

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

  // this is when the icon is broken.
  if (DEBUG) {
    if (missing[props.name ?? ""] == null) {
      missing[props.name ?? ""] = true;
      console.warn(
        `Icon "${props.name}" is not defined -- fix this in r_misc/icon.tsx.`
      );
    }
    // make it hopefully clear to devs that this icon is broken
    return (
      <span
        style={{ background: "red", color: "white" }}
        className="blink"
        title={`Icon "${props.name}" is not defined -- fix this in r_misc/icon.tsx.`}
      >
        {/* @ts-ignore */}
        <BugOutlined {...props} />
      </span>
    );
  } else {
    // In production, just show a very generic icon so the user
    // doesn't realize we messed up.
    // @ts-ignore
    return <BorderOutlined {...props} />;
  }
};

/* Here we define a jQuery plugin that turns the old font-awesome css elements
   into react-rendered Icon's.  This is, of course, meant to be some temporary
   code until Jupyter classic and Sage worksheets are rewritten using React.
*/

import * as ReactDOM from "react-dom";
declare var $: any;
$.fn.processIcons = function () {
  return this.each(function () {
    // @ts-ignore
    const that = $(this);
    for (const elt of that.find(".fa")) {
      for (const cls of elt.className.split(/\s+/)) {
        if (cls.startsWith("fa-")) {
          ReactDOM.render(
            <Icon name={cls} spin={cls == "fa-cc-icon-cocalc-ring"} />,
            elt
          );
          break;
        }
      }
    }
  });
};
