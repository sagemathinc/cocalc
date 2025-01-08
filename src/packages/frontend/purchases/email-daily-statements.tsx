import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { CSSProperties } from "react";
import { Checkbox, Tooltip } from "antd";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  style?: CSSProperties;
}

export default function EmailDailyStatements({ style }: Props) {
  const email_daily_statements: boolean =
    useTypedRedux("account", "email_daily_statements") ?? false;
  return (
    <Tooltip title="Email a statement to you listing the purchases you make each day, so you can keep track of your spending.  Monthly statements are always sent to you.">
      <Checkbox
        style={style}
        checked={email_daily_statements}
        onChange={(e) =>
          redux
            .getActions("account")
            .set_account_table({ email_daily_statements: e.target.checked })
        }
      >
        Email daily statements
      </Checkbox>
    </Tooltip>
  );
}
