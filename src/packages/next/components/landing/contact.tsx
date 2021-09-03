import { useCustomize } from "lib/customize";
import A from "components/misc/A";

export default function Contact() {
  const { contactEmail } = useCustomize();
  if (!contactEmail) return null;
  return <A href={"mailto:" + contactEmail}>Contact {contactEmail}</A>;
}
