import { useIntl } from "react-intl";

import { labels } from "./common";

export function CancelText() {
  const intl = useIntl();
  return intl.formatMessage(labels.cancel);
}
