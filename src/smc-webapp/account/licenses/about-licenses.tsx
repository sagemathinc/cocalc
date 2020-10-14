import { React } from "../../app-framework";
import { A } from "../../r_misc";
import { DOC_LICENSE_URL } from "../../billing/data";

export const AboutLicenses: React.FC = () => {
  return (
    <div>
      <h3>About</h3>
      <A href={DOC_LICENSE_URL}>
        Licenses
      </A>{" "}
      allow you to automatically upgrade projects whenever they start up, so
      that they have more memory, better hosting, run faster, etc.
    </div>
  );
};
