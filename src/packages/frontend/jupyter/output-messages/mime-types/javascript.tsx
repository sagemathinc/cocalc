import register from "./register";
import { Javascript } from "../javascript";
import { UntrustedJavascript } from "../untrusted-javascript";

register("application/javascript", 2.5, ({ value, trust }) => {
  if (trust) {
    return <Javascript value={value} />;
  }
  return <UntrustedJavascript value={value} />;
});
