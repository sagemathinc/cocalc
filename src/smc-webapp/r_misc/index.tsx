/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_frontend, Null } from "./null";

export { A } from "./A";
export { Icon } from "./icon";
export const Tip = is_frontend
  ? require("./tip").Tip
  : require("./tip-backend").Tip;
export { Loading, Estimate as LoadingEstimate } from "./loading";
export { r_join } from "./r_join";
export { Space } from "./space";
export { CloseX } from "./close-x";
export { CloseX2 } from "./close-x2";
export { SimpleX } from "./simple-x";
export { Saving } from "./saving";
export { Spinner } from "./spinner";
export const ErrorDisplay = is_frontend
  ? require("./error-display").ErrorDisplay
  : require("./error-display-backend").ErrorDisplay;
export { SkinnyError } from "./skinny-error";
export { SelectorInput } from "./selector-input";
export { TextInput } from "./text-input";
export const NumberInput = is_frontend
  ? require("./number-input").NumberInput
  : require("./number-input-backend").NumberInput;
export { LabeledRow } from "./labeled-row";
export { TimeElapsed } from "./time-elapsed";
export { SettingBox } from "./setting-box";
export { ProfileIcon } from "./profile-icon";

const dropdown_menu_module = is_frontend
  ? require("./dropdown-menu")
  : { DropdownMenu: Null, MenuItem: Null, MenuDivider: Null };
export const { DropdownMenu, MenuItem, MenuDivider } = dropdown_menu_module;
export { WindowedList } from "./windowed-list";
export { UncommittedChanges } from "./uncommited-changes";
export const DateTimePicker = is_frontend
  ? require("./date-time-picker").DateTimePicker
  : Null;
export const PathLink = is_frontend ? require("./path-link").PathLink : Null;
export const HelpIcon = is_frontend ? require("./help-icon").HelpIcon : Null;
const time_ago_module = is_frontend
  ? require("./time-ago")
  : { TimeAgo: Null, TimeAgoElement: Null, is_different_date: () => true };
export const { TimeAgo, TimeAgoElement, is_different_date } = time_ago_module;
export {
  HiddenXS,
  HiddenSM,
  HiddenXSSM,
  VisibleMDLG,
  VisibleLG,
  VisibleXSSM,
} from "./hidden-visible";
export const LoginLink = is_frontend ? require("./login-link").LoginLink : Null;
export { ProjectState } from "./project-state";

export const {
  MarkdownInput,
  UNIT,
  BS_BLUE_BGRND,
  COLORS,
  ImmutablePureRenderMixin,
  Octicon,
  Footer,
  render_static_footer,
  SearchInput,
  HTML,
  Markdown,
  ActivityDisplay,
  DeletedProjectWarning,
  course_warning,
  CourseProjectExtraHelp,
  CourseProjectWarning,
  NonMemberProjectWarning,
  NoNetworkProjectWarning,
  EditorFileInfoDropdown,
  render_file_info_dropdown,
  UPGRADE_ERROR_STYLE,
  NoUpgrades,
  UpgradeAdjustor,
  CopyToClipBoard,
  ErrorBoundary,
  smc_version,
  build_date,
  smc_git_rev,
} = require("./old-coffee-code-index");
