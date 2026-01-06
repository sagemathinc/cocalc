/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare var DEBUG: boolean; // comes from static webpack; not defined in other contexts.

import React from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import useOnFrontend from "./use-on-frontend";

import {
  AimOutlined,
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  ApiOutlined,
  AppstoreOutlined,
  AreaChartOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  ArrowsAltOutlined,
  AudioOutlined,
  BackwardOutlined,
  BankOutlined,
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
  CheckCircleOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  CloseCircleTwoTone,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudFilled,
  CloudServerOutlined,
  CloudUploadOutlined,
  ClusterOutlined,
  CodeOutlined,
  CoffeeOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  CommentOutlined,
  CompassOutlined,
  ContainerOutlined,
  ControlOutlined,
  CopyOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseFilled,
  DatabaseOutlined,
  DeleteOutlined,
  DeliveredProcedureOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  DownCircleOutlined,
  DownOutlined,
  DownSquareOutlined,
  DownloadOutlined,
  EditFilled,
  EditOutlined,
  EllipsisOutlined,
  ExclamationCircleFilled,
  ExpandOutlined,
  ExperimentOutlined,
  ExportOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FacebookFilled,
  FacebookOutlined,
  FieldTimeOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FireOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FontSizeOutlined,
  ForkOutlined,
  ForwardOutlined,
  FrownOutlined,
  FunctionOutlined,
  FundProjectionScreenOutlined,
  GatewayOutlined,
  GiftOutlined,
  GiftTwoTone,
  GithubFilled,
  GithubOutlined,
  GlobalOutlined,
  GoogleOutlined,
  GroupOutlined,
  HddOutlined,
  HighlightOutlined,
  HistoryOutlined,
  HomeOutlined,
  HourglassOutlined,
  Html5Outlined,
  IdcardOutlined,
  InfoCircleOutlined,
  InfoOutlined,
  InstagramFilled,
  InstagramOutlined,
  ItalicOutlined,
  KeyOutlined,
  LaptopOutlined,
  LayoutOutlined,
  LeftCircleOutlined,
  LeftOutlined,
  LeftSquareFilled,
  LineChartOutlined,
  LineHeightOutlined,
  LinkOutlined,
  LinkedinFilled,
  LinkedinOutlined,
  LoadingOutlined,
  LockFilled,
  LockOutlined,
  LoginOutlined,
  MailOutlined,
  MedicineBoxOutlined,
  MehOutlined,
  MenuOutlined,
  MergeCellsOutlined,
  MinusCircleOutlined,
  MinusOutlined,
  MinusSquareOutlined,
  OrderedListOutlined,
  PauseCircleOutlined,
  PercentageOutlined,
  PicCenterOutlined,
  PieChartOutlined,
  PlayCircleFilled,
  PlayCircleOutlined,
  PlaySquareOutlined,
  PlusCircleFilled,
  PlusCircleOutlined,
  PlusOutlined,
  PlusSquareOutlined,
  PoweroffOutlined,
  PrinterOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
  RetweetOutlined,
  RightCircleFilled,
  RightCircleOutlined,
  RightOutlined,
  RightSquareFilled,
  RiseOutlined,
  RobotOutlined,
  RocketOutlined,
  SaveOutlined,
  ScissorOutlined,
  SearchOutlined,
  SelectOutlined,
  SendOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShoppingCartOutlined,
  ShrinkOutlined,
  SignatureOutlined,
  SlidersOutlined,
  SmileOutlined,
  SolutionOutlined,
  SoundOutlined,
  StarFilled,
  StarOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  StopFilled,
  StopOutlined,
  StrikethroughOutlined,
  SwapLeftOutlined,
  SwapOutlined,
  SwapRightOutlined,
  SyncOutlined,
  TableOutlined,
  TagFilled,
  TagOutlined,
  TagTwoTone,
  TagsFilled,
  TagsOutlined,
  TagsTwoTone,
  TeamOutlined,
  ThunderboltOutlined,
  ToTopOutlined,
  ToolOutlined,
  TranslationOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnlockFilled,
  UnorderedListOutlined,
  UpCircleOutlined,
  UpOutlined,
  UpSquareOutlined,
  UploadOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignMiddleOutlined,
  VerticalLeftOutlined,
  VerticalRightOutlined,
  VideoCameraOutlined,
  WalletOutlined,
  WarningOutlined,
  WifiOutlined,
  XOutlined,
  YoutubeFilled,
  YoutubeOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";

// Unfortunately -- "error TS7056: The inferred type of this node exceeds the maximum length the
// compiler will serialize. An explicit type annotation is needed."
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
  api: ApiOutlined,
  audio: AudioOutlined,
  aws: { IconFont: "aws" },
  backward: BackwardOutlined,
  "battery-empty": { IconFont: "battery-empty" },
  "battery-quarter": { IconFont: "battery-quarter" },
  "battery-half": { IconFont: "battery-half" },
  "battery-three-quarters": { IconFont: "battery-three-quarters" },
  "battery-full": { IconFont: "battery-full" },
  ban: StopOutlined,
  bank: BankOutlined,
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
  areaChart: AreaChartOutlined,
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
  "close-circle-filled": CloseCircleFilled,
  clone: { IconFont: "clone" },
  cloud: CloudFilled,
  "cloud-dev": { IconFont: "cloud-dev" },
  "cloud-download": CloudDownloadOutlined,
  "cloud-download-alt": CloudDownloadOutlined,
  "cloud-upload": CloudUploadOutlined,
  "cocalc-ring": { IconFont: "cocalc-ring" },
  code: { IconFont: "code" },
  "code-outlined": CodeOutlined,
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
  container: ContainerOutlined,
  copy: CopyOutlined,
  "credit-card": CreditCardOutlined,
  csv: { IconFont: "csv" },
  cube: { IconFont: "cube" },
  cut: ScissorOutlined,
  dashboard: DashboardOutlined,
  database: DatabaseOutlined,
  "database-filled": DatabaseFilled,
  "deployment-unit": DeploymentUnitOutlined,
  dedicated: DatabaseOutlined, // icon for "dedicated resources", looks like a server rack
  desktop: DesktopOutlined,
  "delivered-procedure-outlined": DeliveredProcedureOutlined,
  digitalocean: { IconFont: "digitalocean" },
  discord: { IconFont: "discord" },
  "disk-drive": { IconFont: "disk-drive" },
  "disk-round": { IconFont: "disk-round" },
  "disk-snapshot": { IconFont: "disk-snapshot" },
  dns: { IconFont: "dns" },
  docker: { IconFont: "docker" },
  download: DownloadOutlined,
  "dot-circle": { IconFont: "dot-circle" },
  edit: EditOutlined,
  "edit-filled": EditFilled,
  eraser: { IconFont: "Eraser-Tool" },
  ellipsis: EllipsisOutlined,
  envelope: { IconFont: "envelope" },
  exchange: { IconFont: "exchange" },
  "exclamation-circle": ExclamationCircleFilled,
  "exclamation-triangle": WarningOutlined,
  expand: ExpandOutlined,
  "expand-arrows": ArrowsAltOutlined,
  experiment: ExperimentOutlined,
  "external-link": { IconFont: "external-link-alt" },
  eye: EyeOutlined,
  "eye-slash": EyeInvisibleOutlined,
  "facebook-filled": FacebookFilled,
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
  fire: FireOutlined,
  firefox: { IconFont: "firefox" },
  flash: ThunderboltOutlined,
  "flow-chart": { IconFont: "flow-chart" },
  folder: FolderOutlined,
  "folder-open": FolderOpenOutlined,
  font: { IconFont: "font" },
  "font-size": FontSizeOutlined,
  forward: ForwardOutlined,
  frame: { IconFont: "frame" },
  frown: FrownOutlined,
  fx: FunctionOutlined,
  slides: FundProjectionScreenOutlined,
  "project-outlined": ProjectOutlined,
  "gateway-outlined": GatewayOutlined,
  gavel: { IconFont: "gavel" },
  gears: ControlOutlined,
  gear: ControlOutlined,
  gift: GiftOutlined,
  gift2: GiftTwoTone,
  "github-filled": GithubFilled,
  github: GithubOutlined,
  git: { IconFont: "git1" },
  "git-square": { IconFont: "git-square" },
  global: GlobalOutlined,
  emacs: { IconFont: "gnuemacs" },
  google: GoogleOutlined,
  googlecloud: { IconFont: "googlecloud" },
  "graduation-cap": { IconFont: "graduation" },
  graph: { IconFont: "graph" },
  grass: { IconFont: "grass" },
  group: { IconFont: "group" },
  "group-outlined": GroupOutlined,
  gpu: { IconFont: "gpu" },
  hand: { IconFont: "hand" },
  "hand-stop": PoweroffOutlined,
  header: { IconFont: "header" },
  heart: { IconFont: "heart" },
  hdd: HddOutlined,
  highlighter: HighlightOutlined,
  history: HistoryOutlined,
  home: HomeOutlined,
  "horizontal-split": { IconFont: "horizontal-split" },
  "hourglass-half": HourglassOutlined,
  html5: Html5Outlined,
  image: { IconFont: "image" },
  icons: { IconFont: "icons" },
  "info-circle": InfoCircleOutlined,
  indent: { IconFont: "indent" },
  info: InfoOutlined,
  inkscape: { IconFont: "inkscape" },
  "instagram-filled": InstagramFilled,
  instagram: InstagramOutlined,
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
  "linkedin-filled": LinkedinFilled,
  linkedin: LinkedinOutlined,
  linux: { IconFont: "linux" },
  list: UnorderedListOutlined,
  "list-ul": UnorderedListOutlined,
  "list-alt": UnorderedListOutlined,
  "list-ol": OrderedListOutlined,
  "lock-open": UnlockFilled,
  lock: LockFilled,
  "lock-outlined": LockOutlined,
  magic: { IconFont: "magic" },
  mail: MailOutlined,
  map: { IconFont: "map" },
  markdown: { IconFont: "markdown" },
  mask: { IconFont: "mask" },
  maple: { IconFont: "maple" },
  mathematica: { IconFont: "mathematica" },
  matlab: { IconFont: "matlab" },
  medkit: MedicineBoxOutlined,
  "menu-outlined": MenuOutlined,
  meh: MehOutlined,
  microchip: { IconFont: "microchip" },
  microsoft: { IconFont: "microsoft" },
  "minus-circle": MinusCircleOutlined,
  "minus-square": MinusSquareOutlined,
  money: CreditCardOutlined,
  "money-check": { IconFont: "money-check" },
  mousepointer: { IconFont: "mousepointer" },
  move: { IconFont: "move" },
  arrows: { IconFont: "move" }, // fa-arrows is used by the bqplot custom widget
  network: { IconFont: "network" },
  "network-server": { IconFont: "network-server" },
  "network-wired": ClusterOutlined,
  "node-js": { IconFont: "node-js" },
  note: { IconFont: "note-text" },
  nvidia: { IconFont: "nvidia" },
  octave: { IconFont: "octave" },
  overview: AppstoreOutlined,
  outdent: { IconFont: "outdent" },
  pause: PauseCircleOutlined,
  "paper-plane": SendOutlined,
  paste: { IconFont: "paste" },
  "pic-centered": PicCenterOutlined,
  pen: { IconFont: "pen" },
  pencil: EditOutlined,
  "pencil-alt": EditOutlined,
  percentage: PercentageOutlined,
  "pie-chart": PieChartOutlined,
  play: PlayCircleOutlined,
  "play-circle": PlayCircleFilled,
  "play-square": PlaySquareOutlined,
  plus: PlusOutlined,
  minus: MinusOutlined,
  "plus-circle": PlusCircleOutlined,
  "plus-circle-o": PlusCircleOutlined,
  "plus-circle-filled": PlusCircleFilled,
  "plus-one": { IconFont: "plus-one" },
  "plus-square": PlusSquareOutlined,
  "plus-square-o": PlusSquareOutlined,
  PoweroffOutlined,
  print: PrinterOutlined,
  python: { IconFont: "python" },
  pytorch: { IconFont: "pytorch" },
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
  reply: { IconFont: "reply" },
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
  "search-minus": ZoomOutOutlined,
  "search-plus": ZoomInOutlined,
  "select-outlined": SelectOutlined,
  settings: SettingOutlined,
  server: CloudServerOutlined,
  servers: { IconFont: "servers" },
  "sign-in": LoginOutlined,
  "sign-out-alt": LoginOutlined, // Yes, since the logout one breaks darkreader, weirdly! they both look reasonable.
  sitemap: ClusterOutlined,
  "share-square": ShareAltOutlined,
  "shopping-cart": ShoppingCartOutlined,
  sliders: SlidersOutlined,
  smile: SmileOutlined,
  "sort-amount-up": { IconFont: "sort-amount-up" },
  spinner: { IconFont: "cocalc-ring" },
  square: BorderOutlined,
  solution: SolutionOutlined,
  "square-o": BorderOutlined,
  "square-root-alt": { IconFont: "square-root-alt" },
  "star-filled": StarFilled,
  star: StarOutlined,
  "step-backward": StepBackwardOutlined,
  "step-forward": StepForwardOutlined,
  stop: { IconFont: "stop" }, // the ant-design "stop" looks weird.
  "stop-filled": StopFilled,
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
  "tag-outlined": TagOutlined,
  "tags-outlined": TagsOutlined,
  "tag-filled": TagFilled,
  "tags-filled": TagsFilled,
  "tag-two-tone": TagTwoTone,
  "tags-two-tone": TagsTwoTone,
  "team-outlined": TeamOutlined,
  tensorflow: { IconFont: "tensorflow" },
  terminal: CodeOutlined,
  tex: { IconFont: "tex" },
  text: { IconFont: "text" },
  text1: { IconFont: "text1" },
  "tex-file": { IconFont: "tex-file" },
  "text-height": LineHeightOutlined,
  times: CloseOutlined,
  "times-circle": CloseCircleOutlined,
  "times-rectangle": { IconFont: "times-rectangle" },
  "thumbs-down": { IconFont: "thumbs-down" },
  "thumbs-up": { IconFont: "thumbs-up" },
  "toggle-off": { IconFont: "toggle-off" },
  "toggle-on": { IconFont: "toggle-on" },
  tool: ToolOutlined,
  trash: DeleteOutlined,
  "twitter-filled": XOutlined,
  twitter: XOutlined,
  ubuntu: { IconFont: "ubuntu" },
  underline: UnderlineOutlined,
  undo: UndoOutlined,
  ungroup: { IconFont: "ungroup" },
  "signature-outlined": SignatureOutlined,
  swap: SwapOutlined,
  "sync-left": SwapLeftOutlined,
  "sync-right": SwapRightOutlined,
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
  "vertical-right-outlined": VerticalRightOutlined,
  "video-camera": VideoCameraOutlined,
  "vertical-align-middle": VerticalAlignMiddleOutlined,
  "vertical-align-bottom": VerticalAlignBottomOutlined,
  "vertical-left-outlined": VerticalLeftOutlined,
  vim: { IconFont: "vim" },
  vscode: { IconFont: "vscode" },
  wallet: WalletOutlined,
  warning: WarningOutlined,
  wifi: WifiOutlined,
  "window-maximize": { IconFont: "window-maximize" },
  "window-restore": DesktopOutlined, //  we only use for x11 and this has big X.
  wrench: { IconFont: "wrench" },
  youtube: YoutubeOutlined,
  "youtube-filled": YoutubeFilled,
  "left-circle-o": LeftCircleOutlined,
  "right-circle-o": RightCircleOutlined,
  "down-circle-o": DownCircleOutlined,
  "translation-outlined": TranslationOutlined,
  "clean-outlined": ClearOutlined,
  "sound-outlined": SoundOutlined,
  "rise-outlined": RiseOutlined,
  "up-square-outlined": UpSquareOutlined,
  "down-square-outlined": DownSquareOutlined,
  "merge-cells-outlined": MergeCellsOutlined,
  "fork-outlined": ForkOutlined,
  "to-top-outlined": ToTopOutlined,
  "column-width": ColumnWidthOutlined,
  "column-height": ColumnHeightOutlined,
} as const;

// Icon Fonts coming from https://www.iconfont.cn/?lang=en-us
import { createFromIconfontCN } from "@ant-design/icons";
export let IconFont: any = undefined;
try {
  if (typeof window != "undefined") {
    // obviously won't work if window is undefined based on looking at the code...
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
    if (typeof DEBUG != "undefined" && DEBUG) {
      setTimeout(() => {
        // only do this during dev to save time.
        for (const name in IconSpec) {
          const spec = IconSpec[name];
          const x = spec?.IconFont;
          if (x != null) {
            const id = `icon-${x}`;
            if (document.getElementById(id) == null) {
              console.error(
                `ERROR -- the IconFont ${x} is not in components/iconfont.cn!  Fix this or the icon ${name} will be broken.`,
              );
            }
          }
        }
      }, 5000);
    }
  }
} catch (err) {
  // Might as well have option for a graceful fallback, e.g., when
  // used from node.js...
  if (!process.env.COCALC_TEST_MODE) {
    console.log(`IconFont not available -- ${err}`);
  }
}

// This used to exceed TypeScript limits, but apparently it is ok now…
export type IconName = keyof typeof IconSpec;
export const IconName = undefined; // Javascript needs this, though we are only using IconName for the type

// Typeguard so can tell if a string is name of an icon and also
// make typescript happy.
export function isIconName(name?: unknown): name is IconName {
  if (name == null) return false;
  if (typeof name !== "string") return false;
  return IconSpec[name] != null;
}

export const iconNames: IconName[] = Object.keys(IconSpec) as any;

export type IconRotation = "45" | "90" | "135" | "180" | "225" | "270" | "315";

interface Props {
  name?: IconName;
  unicode?: number; // (optional) set a hex 16 bit charcode to render a unicode char, e.g. 0x2620
  className?: string;
  size?: "lg" | "2x" | "3x" | "4x" | "5x";
  rotate?: IconRotation;
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
  // IMPORTANT: This hook is needed for next.js to support server side rendering.
  // Otherwise, at least with next 13, it crashes when rendering icons.
  const onFrontend = useOnFrontend();
  if (!onFrontend) return null;

  if (props.unicode != null) {
    const style: React.CSSProperties = { ...UNICODE_STYLE, ...props.style };

    // Apply CSS transformations for unicode characters
    if (props.rotate) {
      style.display = style.display ?? "inline-block";
      style.transform = `rotate(${props.rotate}deg)`;
    }
    if (props.flip) {
      style.display = style.display ?? "inline-block";
      const flipTransform =
        props.flip === "horizontal" ? "scaleX(-1)" : "scaleY(-1)";
      style.transform = style.transform
        ? `${style.transform} ${flipTransform}`
        : flipTransform;
    }

    return (
      <span style={style}>
        {String.fromCharCode(props.unicode!)}
      </span>
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
        return <span>(IconFonts not available)</span>;
      }
      return <IconFont type={"icon-" + C.IconFont} {...props} alt={name} />;
    }
    return <C {...props} alt={name} />;
  }

  // this is when the icon is broken.
  if (typeof DEBUG != "undefined" && DEBUG) {
    if (missing[props.name ?? ""] == null) {
      missing[props.name ?? ""] = true;
      console.warn(
        `Icon "${props.name}" is not defined -- fix this in components/icon.tsx.`,
      );
    }
    // make it hopefully clear to devs that this icon is broken
    return (
      <span
        style={{ background: "red", color: "white" }}
        className="blink"
        title={`Icon "${props.name}" is not defined -- fix this in components/icon.tsx.`}
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

// TOOD move this to a shared lib, which can import the IconName type
export const PAYASYOUGO_ICON: IconName = "compass";
