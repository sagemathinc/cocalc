/* The information that describes the cocalc server.
   This is just a type declaration for documentation purposes and the
   hub does user the server with this (see smc-hub/servers/app/landing.ts).*/

export interface Customize {
  siteName?: string;
  siteDescription?: string;
  organizationName?: string;
  organizationEmail?: string;
  organizationURL?: string;
  termsOfServiceURL?: string;
  helpEmail?: string;
  contactEmail?: string;
  isCommercial?: boolean;
  anonymousSignup?: boolean;
  logoSquareURL?: string;
  logoRectangularURL?: string;
  splashImage?: string;
  indexInfo?: string;
  basePath?: string;
}

// I tried many ways, and using next.js's process.env support
// seems by far the best approach.  It's the way that ensures that
// you can't change the result, which makes nextjs happy.
const customize: Customize = process.env.CUSTOMIZE
  ? JSON.parse(process.env.CUSTOMIZE)
  : {};

// as defined in cocalc (not next.js!), so "/" is the nothing base path.
customize.basePath = process.env.BASE_PATH ? process.env.BASE_PATH : "/";

export default customize;
