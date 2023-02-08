/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Typography } from "antd";

import CopyToClipBoard from "./copy-to-clipboard";
import Delay from "./delay";

export { MarkdownInput } from "../markdown/markdown-input/main";
export { A } from "./A";
export { ActivityDisplay } from "./activity-display";
export { CloseX } from "./close-x";
export { CloseX2 } from "./close-x2";
export { build_date, smc_git_rev, smc_version, UNIT } from "./constants";
export { DateTimePicker } from "./date-time-picker";
export { DropdownMenu, MenuDivider, MenuItem } from "./dropdown-menu";
export { ErrorDisplay } from "./error-display";
export { HelpIcon } from "./help-icon";
export * from "./hidden-visible";
export { HTML } from "./html";
export { Icon, IconName, isIconName } from "./icon";
export { LabeledRow } from "./labeled-row";
export { Estimate as LoadingEstimate, Loading } from "./loading";
export { LoginLink } from "./login-link";
export { Markdown } from "./markdown";
export { NoWrap } from "./nowrap";
export { NumberInput } from "./number-input";
export { PathLink } from "./path-link";
export { ProfileIcon } from "./profile-icon";
export { ProjectState } from "./project-state";
export { QuestionMarkText } from "./question-mark-text";
export { r_human_list } from "./r_human_list";
export { r_join } from "./r_join";
export { Saving } from "./saving";
export { SearchInput } from "./search-input";
export { SelectorInput } from "./selector-input";
export { SettingBox } from "./setting-box";
export { SimpleX } from "./simple-x";
export { SkinnyError } from "./skinny-error";
export { Space } from "./space";
export * from "./table-of-contents";
export { TextInput } from "./text-input";
export { is_different_date, TimeAgo, TimeAgoElement } from "./time-ago";
export { TimeElapsed } from "./time-elapsed";
export { Tip } from "./tip";
export { UncommittedChanges } from "./uncommited-changes";
export { UpgradeAdjustor, UPGRADE_ERROR_STYLE } from "./upgrade-adjustor";
export { CopyToClipBoard };
export { Delay };

export const { Text, Title, Paragraph } = Typography;
