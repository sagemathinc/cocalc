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
  basePath: string;
}

// I tried many ways, and using next.js's process.env support
// seems by far the best approach.  Using process.env ensures that
// you can't change the result once the app is running, which
// makes nextjs happy.

const CUSTOMIZE: Customize = process.env.CUSTOMIZE
  ? JSON.parse(process.env.CUSTOMIZE)
  : { basePath: "/" };

if (CUSTOMIZE.basePath == null) {
  CUSTOMIZE.basePath = "/"; // ensure guarantee of type
}

// The following is redundant, but Typescript checks it and
// it is very convenient regarding making this easy to use
// from other modules.

const {
  siteName,
  siteDescription,
  organizationName,
  organizationEmail,
  organizationURL,
  termsOfServiceURL,
  helpEmail,
  contactEmail,
  isCommercial,
  anonymousSignup,
  logoSquareURL,
  logoRectangularURL,
  splashImage,
  indexInfo,
  basePath,
} = CUSTOMIZE;

export {
  siteName,
  siteDescription,
  organizationName,
  organizationEmail,
  organizationURL,
  termsOfServiceURL,
  helpEmail,
  contactEmail,
  isCommercial,
  anonymousSignup,
  logoSquareURL,
  logoRectangularURL,
  splashImage,
  indexInfo,
  basePath,
};
