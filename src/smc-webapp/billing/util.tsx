import { React, Rendered } from "../app-framework";
import { Icon } from "../r_misc/icon";

export function powered_by_stripe(): Rendered {
  return (
    <span>
      Powered by{" "}
      <a
        href="https://stripe.com/"
        rel="noopener"
        target="_blank"
        style={{ top: "7px", position: "relative", fontSize: "23pt" }}
      >
        <Icon name="cc-stripe" />
      </a>
    </span>
  );
}
