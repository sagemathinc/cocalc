import { FormattedMessage } from "react-intl";

import { labels } from "./common";

export function CancelText() {
  return <FormattedMessage {...labels.button_cancel} />;
}
