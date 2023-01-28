// Specify the favicon.

import { Helmet } from "react-helmet";

import useCustomize from "./customize";

export default function LoadFavicons() {
  const customize = useCustomize()

  return (
    <Helmet>
      <link rel="icon" href={customize.logo_square} />
    </Helmet>
  );
}
