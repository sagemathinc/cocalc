// slightly weird props since this will be used in the nextjs app

import { Alert, Card, Checkbox, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function UseBalanceTowardSubscriptions({
  style,
  use_balance_toward_subscriptions,
  set_use_balance_toward_subscriptions,
  minimal,
}) {
  const body = (
    <Alert
      style={{ marginBottom: "15px" }}
      type="info"
      showIcon
      message={
        <div>
          <Tooltip
            title={
              <div>
                Enable this if you do not need to maintain a positive balance
                for pay as you go purchases. If you are using compute servers
                you probably do not want to enable this. However, if you
                primarily put credit on your account to pay for subscriptions,
                consider enabling this. The entire amount for the subscription
                renewal must be available.
              </div>
            }
          >
            <Checkbox
              checked={use_balance_toward_subscriptions}
              onChange={(e) => {
                set_use_balance_toward_subscriptions(e.target.checked);
              }}
            >
              <span style={{ fontSize: "13pt" }}>
                Use Balance - pay subscription using balance on your account, if
                possible.{" "}
                {!use_balance_toward_subscriptions && (
                  <b>(Currently Disabled)</b>
                )}
              </span>
            </Checkbox>
          </Tooltip>
        </div>
      }
    />
  );
  if (minimal) {
    return body;
  }
  return (
    <Card
      style={style}
      title={
        <>
          <Icon name="calendar" /> Use Balance Toward Subscriptions
        </>
      }
    >
      {body}
    </Card>
  );
}
