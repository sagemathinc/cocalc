/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { MessageDescriptor } from "react-intl";

// In CoCalc, we require all message to have an ID and defaultMessage (which is English)
export type IntlMessage = MessageDescriptor & {
  id: string;
  defaultMessage: string;
};

// For us, the id and defaultMessage must be set to be a MessageDescriptor
export function isIntlMessage(msg: unknown): msg is MessageDescriptor {
  return (
    typeof msg === "object" &&
    msg != null &&
    "id" in msg &&
    typeof msg.id === "string" &&
    "defaultMessage" in msg &&
    typeof msg.defaultMessage === "string"
  );
}
