/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
    MessageFormatElement
} from "react-intl";


export type Messages =
  | Record<string, string>
  | Record<string, MessageFormatElement[]>;
