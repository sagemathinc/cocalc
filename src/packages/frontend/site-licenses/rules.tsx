import { useIntl } from "react-intl";

import { A } from "@cocalc/frontend/components/A";
import { labels } from "@cocalc/frontend/i18n";

function LicenseRulesList(): React.JSX.Element {
  const intl = useIntl();
  const projectsLabelLower = intl.formatMessage(labels.projects).toLowerCase();

  return (
    <ul style={{ paddingLeft: "15px" }}>
      <li>
        The <b>run limit</b> of simultaneously running {projectsLabelLower} must
        not be reached.
      </li>
      <li>
        The attempt to use the license is <b>after activation</b> and{" "}
        <b>before expiration</b>.
      </li>
      <li>
        Similar licenses are ignored, if they{" "}
        <b>aren't providing any additional upgrades</b>.
      </li>
      <li>The hard limit on the maximum possible upgrade is reached.</li>
      <li>
        Only licenses of <b>similar nature</b> can be combined: i.e. "member
        hosting" and "idle timeout" must match – higher values take precedence.
      </li>
      <li>
        <b>Boost</b> licenses can only be used in combination with a matching
        regular license.
      </li>
    </ul>
  );
}

export function LicenseActivationRules(): React.JSX.Element {
  return (
    <div style={{ maxWidth: "450px" }}>
      <LicenseRulesList />
    </div>
  );
}

export function LicenseInformation(): React.JSX.Element {
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();

  return (
    <div style={{ maxWidth: "450px" }}>
      <p>
        A license upgrades a {projectLabelLower}. Check the{" "}
        <A href={"https://doc.cocalc.com/licenses.html"}>
          site-license documentation
        </A>{" "}
        for more information. During {projectLabelLower} startup, the status
        and eligibility of each license applied to a {projectLabelLower} is
        evaluated. Here is an overview about the rules:
      </p>

      <LicenseRulesList />
    </div>
  );
}
