import { useCustomize } from "lib/customize";
import A from "components/misc/A";

export default function HelpEmail({ lower }: { lower?: boolean }) {
  const { helpEmail } = useCustomize();
  if (!helpEmail) return null;
  return (
    <A href={"mailto:" + helpEmail}>
      {lower ? "e" : "E"}mail {helpEmail}
    </A>
  );
}
