import { A } from "@cocalc/frontend/components/A";
import getSupportURL from "@cocalc/frontend/support/url";

export default function Support({ children }) {
  return (
    <A
      href={getSupportURL({
        body: "Please change my minimum allowed balance.\n\nTELL US WHO YOU ARE AND EXPLAIN YOUR USE CASE.  THANKS!",
        subject: "Change Minimum Allowed Balance",
        type: "question",
        hideExtra: true,
      })}
    >
      {children}
    </A>
  );
}
