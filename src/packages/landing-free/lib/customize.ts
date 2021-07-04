/* The information that describes the cocalc server.
   This is just a type declaration for documentation purposes and the
   hub does user the server with this (see smc-hub/servers/app/landing.ts).*/

export interface Customize {
  siteName?: string;
  organizationName?: string;
  termsOfServiceURL?: string;
  contactEmail?: string;
}
