import "../styles/globals.css";
import "antd/dist/antd.css";
import type { AppProps } from "next/app";
import { CustomizeContext, CUSTOMIZE } from "lib/customize";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <CustomizeContext.Provider value={CUSTOMIZE}>
      <Component {...pageProps} />
    </CustomizeContext.Provider>
  );
}

export default MyApp;
