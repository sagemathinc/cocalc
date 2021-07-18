/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var DEBUG: boolean; // comes from webpack.

import * as React from "react";
import { CSS } from "../app-framework";

import {
  AimOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  AudioOutlined,
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
  ClockCircleOutlined,
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
  DoubleLeftOutlined,
  DoubleRightOutlined,
  DownCircleOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
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
  HomeOutlined,
  HourglassOutlined,
  Html5Outlined,
  IdcardOutlined,
  InfoCircleOutlined,
  InfoOutlined,
  ItalicOutlined,
  KeyOutlined,
  LaptopOutlined,
  LayoutOutlined,
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
  ReloadOutlined,
  RetweetOutlined,
  RightCircleFilled,
  RightOutlined,
  RightSquareFilled,
  RocketOutlined,
  RobotOutlined,
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
  SyncOutlined,
  TableOutlined,
  ThunderboltOutlined,
  TwitterOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnlockFilled,
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

const IconSpec = {
  "address-card": IdcardOutlined,
  aim: AimOutlined,
  "align-left": AlignLeftOutlined,
  "align-center": AlignCenterOutlined,
  "align-justify": { IconFont: "align-justify" },
  "align-right": AlignRightOutlined,
  "angle-double-left": DoubleLeftOutlined,
  "angle-double-right": DoubleRightOutlined,
  "angle-down": DownOutlined,
  "angle-right": RightOutlined,
  "arrow-circle-o-left": { IconFont: "arrowcircleoleft" },
  "arrow-circle-down": DownCircleOutlined,
  "arrow-circle-up": UpCircleOutlined,
  "arrow-down": ArrowDownOutlined,
  "arrow-left": ArrowLeftOutlined,
  "arrow-right": ArrowRightOutlined,
  "arrow-up": ArrowUpOutlined,
  atom: { IconFont: "Atom" },
  audio: AudioOutlined,
  backward: BackwardOutlined,
  "battery-empty": { IconFont: "battery-empty" },
  "battery-quarter": { IconFont: "battery-quarter" },
  "battery-half": { IconFont: "battery-half" },
  "battery-three-quarters": { IconFont: "battery-three-quarters" },
  "battery-full": { IconFont: "battery-full" },
  ban: StopOutlined,
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
  "cc-discover": { IconFont: "cc-discover" },
  "cc-mastercard": { IconFont: "cc-mastercard" },
  "cc-visa": { IconFont: "cc-visa" },
  "cc-stripe": { IconFont: "cc-stripe" },
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
  clock: ClockCircleOutlined,
  "close-circle-two-tone": CloseCircleTwoTone,
  clone: { IconFont: "clone" },
  cloud: CloudFilled,
  "cloud-download": CloudDownloadOutlined,
  "cloud-download-alt": CloudDownloadOutlined,
  "cloud-upload": CloudUploadOutlined,
  "cocalc-ring": { IconFont: "cocalc-ring" },
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
  cut: ScissorOutlined,
  dashboard: DashboardOutlined,
  database: DatabaseOutlined,
  desktop: DesktopOutlined,
  discord: { IconFont: "discord" },
  docker: { IconFont: "docker" },
  "dot-circle": { IconFont: "dot-circle" },
  edit: EditOutlined,
  ellipsis: EllipsisOutlined,
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
  "file-zip": FileZipOutlined,
  files: CopyOutlined,
  "file-export": ExportOutlined,
  firefox: { IconFont: "firefox" },
  flash: ThunderboltOutlined,
  "flow-chart": { IconFont: "flow-chart" },
  folder: FolderOutlined,
  "folder-open": FolderOpenOutlined,
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
  home: HomeOutlined,
  "horizontal-split": { IconFont: "horizontal-split" },
  "hourglass-half": HourglassOutlined,
  html5: Html5Outlined,
  image: { IconFont: "image" },
  "info-circle": InfoCircleOutlined,
  indent: { IconFont: "indent" },
  info: InfoOutlined,
  inkscape: { IconFont: "inkscape" },
  ipynb: { IconFont: "ipynb" },
  italic: ItalicOutlined,
  "js-square": { IconFont: "js-square" },
  julia: { IconFont: "julia" },
  jupyter: { IconFont: "ipynb" },
  key: KeyOutlined,
  keyboard: { IconFont: "keyboard" },
  laptop: LaptopOutlined,
  layout: LayoutOutlined,
  "skull-crossbones": { IconFont: "leave_conference" },
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
  "lock-open": UnlockFilled,
  magic: { IconFont: "magic" },
  markdown: { IconFont: "markdown" },
  mask: { IconFont: "mask" },
  medkit: MedicineBoxOutlined,
  microchip: { IconFont: "microchip" },
  "minus-circle": MinusCircleOutlined,
  "minus-square": MinusSquareOutlined,
  money: CreditCardOutlined,
  "money-check": { IconFont: "money-check" },
  move: { IconFont: "move" },
  "network-wired": ClusterOutlined,
  "node-js": { IconFont: "node-js" },
  octave: { IconFont: "octave" },
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
  python: { IconFont: "python" },
  qgis: { IconFont: "qgis" },
  "question-circle": QuestionCircleOutlined,
  "quote-left": { IconFont: "quote-left" },
  r: { IconFont: "r" },
  racket: { IconFont: "racket" },
  redo: RedoOutlined,
  refresh: RedoOutlined,
  reload: ReloadOutlined,
  remove: CloseOutlined,
  repeat: RedoOutlined,
  replace: { IconFont: "find-replace" },
  retweet: RetweetOutlined,
  robot: RobotOutlined,
  rocket: RocketOutlined,
  run: { IconFont: "run" },
  sagemath: { IconFont: "sagemath" },
  "sagemath-bold": { IconFont: "sagemath-bold" },
  "sagemath-file": { IconFont: "sagemath-file" },
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
  spinner: { IconFont: "cocalc-ring" },
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
  "tex-file": { IconFont: "tex-file" },
  "text-height": LineHeightOutlined,
  times: CloseOutlined,
  "times-circle": CloseCircleOutlined,
  "times-rectangle": { IconFont: "times-rectangle" },
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
  "user-secret": { IconFont: "user-secret" },
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
  wrench: { IconFont: "wrench" },
};

// Icon Fonts coming from https://www.iconfont.cn/?lang=en-us
import { createFromIconfontCN } from "@ant-design/icons";
let IconFont: any = undefined;
try {
  // This loads a bunch of svg elements of the form <svg id="icon-<name>"... into the DOM.
  // The antd Icon code then duplicates these via the <use> html tag
  // (https://developer.mozilla.org/en-US/docs/Web/SVG/Element/use)
  require("./iconfont.cn");
  // note -- we do NOT pass scriptUrl in, as in the docs!  Why?  Because
  // we want everything bundled up into webpack, rather than having to pull
  // from some random place, which just causes confusion with releases
  // and caching.  Fortunately, just evaluating the js from iconfont, then
  // running createFromIconfontCN with no arguments does work, as I deduced
  // by reading the code, then trying this.
  // https://github.com/ant-design/ant-design-icons/blob/5be2afd296636ab4cfec5d3a2793d6cd41b1789b/packages/icons-vue/src/components/IconFont.tsx

  IconFont = createFromIconfontCN();

  // It would be easy to screw up and put an entry like
  //        "arrow-circle-o-left": { IconFont: "arrowcircleoleft" }
  // in IconSpec, but forget to actually include "arrowcircleoleft" in
  // iconfont.cn, or -- just as bad -- make a typo or put the wrong name in.
  // So we double check that all iconfonts are actually defined here:
  if (DEBUG) {
    setTimeout(() => {
      // only do this during dev to save time.
      for (const name in IconSpec) {
        const spec = IconSpec[name];
        const x = spec?.IconFont;
        if (x != null) {
          const id = `icon-${x}`;
          if (document.getElementById(id) == null) {
            console.error(
              `ERROR -- the IconFont ${x} is not in r_misc/iconfont.cn!  Fix this or the icon ${name} will be broken.`
            );
          }
        }
      }
    }, 5000);
  }
} catch (err) {
  // Might as well have option for a graceful fallback, e.g., when
  // used from node.js...
  console.log(`IconFont not available -- ${err}`);
}

export type IconName = keyof typeof IconSpec;
export const IconName = undefined; // Javascript needs this, though we are only using IconName for the type

// Typeguard so can tell if a string is name of an icon and also
// make typescript happy.
export function isIconName(name: string): name is IconName {
  return IconSpec[name] != null;
}

interface Props {
  name?: IconName;
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

  let name: IconName = props.name ?? "square";
  let C;
  C = IconSpec[name];
  if (C == null && name.endsWith("-o")) {
    // should be impossible because of typescript...
    // try without -o
    C = IconSpec[name.slice(0, name.length - 2)];
  }
  if (C != null) {
    if (typeof C.IconFont == "string") {
      // @ts-ignore
      if (IconFont == null) {
        return <div>(IconFonts not available)</div>;
      }
      return <IconFont type={"icon-" + C.IconFont} {...props} alt={name} />;
    }
    return <C {...props} alt={name} />;
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
        <BugOutlined {...props} alt={name} />
      </span>
    );
  } else {
    // In production, just show a very generic icon so the user
    // doesn't realize we messed up.
    // @ts-ignore
    return <BorderOutlined {...props} alt={name} />;
  }
};

/* Here we define a jQuery plugin that turns the old font-awesome css elements
   into react-rendered Icon's.  This is, of course, meant to be some temporary
   code until Jupyter classic and Sage worksheets are rewritten using React.
*/

import * as ReactDOM from "react-dom";
declare var $: any;
try {
  $.fn.processIcons = function () {
    return this.each(function () {
      // @ts-ignore
      const that = $(this);
      for (const elt of that.find(".fa")) {
        for (const cls of elt.className.split(/\s+/)) {
          if (cls.startsWith("fa-")) {
            ReactDOM.render(
              <Icon name={cls.slice(3)} spin={cls == "fa-cocalc-ring"} />,
              elt
            );
            break;
          }
        }
      }
    });
  };
} catch (err) {
  // relatively gracefull fallback when used from node.js without jQuery available
  console.log(`jQuery processIcon plugin not available -- ${err}`);
}
