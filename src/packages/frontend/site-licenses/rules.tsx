import { A } from "@cocalc/frontend/components/A";

const RULES = (
  <ul style={{ paddingLeft: "15px" }}>
    <li>
      The <b>run limit</b> of simultaneously running projects must not be
      reached.
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
    <li>
      A <b>Dedicated Disk</b> can only be attached to one project.
    </li>
    <li>
      A <b>Dedicated VM</b> renders regular and boost licenses ineffective.
    </li>
  </ul>
);

export const LICENSE_ACTIVATION_RULES = (
  <div style={{ maxWidth: "450px" }}>{RULES}</div>
);

export const LICENSE_INFORMATION = (
  <div style={{ maxWidth: "450px" }}>
    <p>
      A license is a set of upgrades that can be applied to a project. Check the{" "}
      <A href={"https://doc.cocalc.com/licenses.html"}>
        site-license documentation
      </A>{" "}
      for more information. During project startup, the status and eligibility
      of each license applied to a project is evaluated. Here is an overview
      about the rules:
    </p>

    {RULES}
  </div>
);
