import { useCustomize } from "lib/customize";
import A from "components/misc/A";

export default function Contact({ lower }: { lower?: boolean }) {
  const { contactEmail } = useCustomize();
  if (!contactEmail) return null;
  return (
    <A href={"mailto:" + contactEmail}>
      {lower ? "c" : "C"}ontact {contactEmail}
    </A>
  );
}
