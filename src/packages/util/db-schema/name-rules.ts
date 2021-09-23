/* Checks that name satisfies the following constraints
Inspired by -- https://github.com/isiahmeadows/github-limits



Each function checks the basic rules, but NOT for uniqueness,
which requires a DB query.

If a rule fails, throws an Error.
*/

/*
Account name:
 - between 1 and 39 characters
 - doesn't start with a -
 - only includes the characters 0-9,a-z,A-Z,-
 - cannot include consecutive hyphens
*/
export function checkAccountName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 39) {
    throw Error("name must have at most 39 characters");
  }
  if (name.includes("--")) {
    throw Error("name must not contain consecutive hyphens");
  }
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(name)) {
    throw Error(
      "name must contain only a-z,A-Z,0-9, or -, and not start with hyphen."
    );
  }
  // Check for reserved names.
  if (RESERVED.has(name.toLowerCase())) {
    throw Error("");
  }
}

/*
Project name:

- Max length: 100 characters
- All characters must be either a hyphen (-), a period (.), or alphanumeric
- Unique amongst projects with given owner
*/
export function checkProjectName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 100) {
    throw Error("name must have at most 100 characters");
  }
  if (!/^[\.a-z\d](?:[\.a-z\d]|-(?=[\.a-z\d])){0,99}$/i.test(name)) {
    throw Error(
      "name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen."
    );
  }
}

/*
Public path name:

- Max length: 100 characters
- All characters must be either a hyphen (-), a period (.), or alphanumeric
- Unique amongst public paths in a given project.
*/

export function checkPublicPathName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 100) {
    throw Error("name must have at most 100 characters");
  }
  if (!/^[\.a-z\d](?:[\.a-z\d]|-(?=[\.a-z\d])){0,99}$/i.test(name)) {
    throw Error(
      "name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen."
    );
  }
}

// Combined words from what we use, https://www.quora.com/How-do-sites-prevent-vanity-URLs-from-colliding-with-future-features
// and https://github.com/Mottie/github-reserved-names/blob/master/reserved-names.json and random other things.
// If you add more and want to clean this up in the console, this may be helpful:
//       Array.from(RESERVED).sort().join(' ')
const RESERVED = new Set(
  `400 401 402 403 404 405 406 407 408 409 410 411 412 413 414 415 416 417 418 419 420 421 422 423 424 425 426 427 428 429 430 431 500 501 502 503 504 505 506 507 508 509 510 511 about access account accounts activate add admin administrator advisories ajax alive analytics anonymous any api app apps archive archives article articles assets attributes auth better billing blob blobs blog bounty branches business businesses c cache cancel careers cart case-studies categories cdn central certification changelog checkout cla cloud cocalc codereview collection collections comments commit commits community companies compare config configuration connect contact contributing cookbook cookies coupons create css customer customer-stories customers customize dashboard dashboards delete design develop developer diff direct_messages discover discussions doc docs documentation download downloads downtime edit editor editors edu email employment enterprise events explore facebook faq favorites featured features feed feedback feeds files fixtures fleet fleets follow followers following font fonts forked forum forums friend friends garage ghost github gist gists graphs group groups guide guides help help-wanted home hooks hosting hostmaster hovercards hub idea ideas identity image images img inbox include includes index individual info integration interfaces introduction invalid-email-address investors invitations invite invoice is issues it job jobs join journal journals json lab labs languages launch layouts learn legal library linux listings lists login logos logout logs mac mail maintenance malware man map maps marketplace mention mentioned mentioning mentions migrating milestones mine mirrors mis misc mobile module modules navigation network new news node nodes none nonprofit nonprofits notices notifications oauth oauth_clients offer offers open-source openid order orders organisations organizations orgs pages partners payments personal plans plugins policies poll polls popular popularity post postmaster posts press pricing primus privacy professional profile profiles projects public pulls put raw rdf rdfs readme recommendations recruitment redeem register registration releases remove render replies reply repositories resources restore revert root rss sagemath sagemathinc sales save save-net-neutrality saved scraping script scripts search security services sessions settings share shareholders shop showcases signin signup site sitemap software spam sponsors ssh ssl ssladmin ssladministrator sslwebmaster staff starred stars static statistics stats status statuses storage store stories styleguide subscribe subscriptions suggest suggestion suggestions support survey surveys suspended sysadmin sysadministrator talks teach teacher teachers teaching team teams template templates ten terms theme themes timeline topic topics tos tour train training translations tree trending trends tutorial tutorials twitter twittr unfollow unsubscribe update updates upload uploads url user username users visualization w watching weather webapp webmaster widget widgets wiki windows works-with ww www www0 www1 www2 www3 www4 www5 www6 www7 www8 www9 wwww xfn xml xmpp yaml yml shit piss fuck cunt cocksucker motherfucker tits`.split(
    /\s+/
  )
);
