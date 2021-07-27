import { siteName, siteDescription } from "lib/customize";

export default function SiteName({ full }: { full?: boolean }) {
  if (full) {
    return (
      <>
        {siteName}: {siteDescription}
      </>
    );
  }
  return <>{siteName}</>;
}
