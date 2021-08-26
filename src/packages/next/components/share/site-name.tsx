import useCustomize from "lib/use-customize";

export default function SiteName({ full }: { full?: boolean }) {
  const { siteName, siteDescription } = useCustomize();
  if (full) {
    return (
      <>
        {siteName}: {siteDescription}
      </>
    );
  }
  return <>{siteName}</>;
}
