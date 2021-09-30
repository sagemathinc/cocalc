/* Checks that name satisfies the following constraints
Inspired by -- https://github.com/isiahmeadows/github-limits



Each function checks the basic rules, but NOT for uniqueness,
which requires a DB query.

If a rule fails, throws an Error.
*/

import { is_valid_uuid_string } from "../misc";

export function isReserved(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}

/*
Account name:
 - between 1 and 39 characters
 - doesn't start with a -
 - only includes the characters 0-9,a-z,A-Z,-
 - Don't allow uuid's.
 - cannot include consecutive hyphens
*/
export function checkAccountName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 39) {
    throw Error("name must have at most 39 characters");
  }
  if (is_valid_uuid_string(name)) {
    throw Error("name must not be a v4 UUID");
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
  if (isReserved(name)) {
    throw Error(`name is reserved -- not available`);
  }
}

/*
Project name:

- Max length: 100 characters
- All characters must be either a hyphen (-), a period (.), or alphanumeric
- Unique amongst projects with given owner
- Don't allow uuid's.
*/
export function checkProjectName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 100) {
    throw Error("name must have at most 100 characters");
  }
  if (is_valid_uuid_string(name)) {
    throw Error("name must not be a v4 UUID");
  }
  if (!/^[\.a-z\d](?:[\.a-z\d]|-(?=[\.a-z\d])){0,99}$/i.test(name)) {
    throw Error(
      "name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen or have spaces."
    );
  }
}

/*
Public path name:

- Max length: 100 characters
- All characters must be either a hyphen (-), a period (.), or alphanumeric
- Unique amongst public paths in a given project.
- Don't allow uuid's.
*/

export function checkPublicPathName(name: string) {
  if (name.length < 1) {
    throw Error("name must have at least 1 character");
  }
  if (name.length > 100) {
    throw Error("name must have at most 100 characters");
  }
  if (is_valid_uuid_string(name)) {
    throw Error("name must not be a v4 UUID");
  }
  if (!/^[\.a-z\d](?:[\.a-z\d]|-(?=[\.a-z\d])){0,99}$/i.test(name)) {
    throw Error(
      "name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen or have spaces."
    );
  }
  // Check for reserved names.  We also ban these for public path names, since
  // we want to have URL's like
  //    https://cocalc.com/sagemathinc/myproject/settings -- configure settings
  //    https://cocalc.com/sagemathinc/myproject/files -- browse all files directly
  //    snapshots, timetravel, new, search, etc...
  if (isReserved(name)) {
    throw Error(`name is reserved -- not available`);
  }
}

// Combined words from what we use, https://www.quora.com/How-do-sites-prevent-vanity-URLs-from-colliding-with-future-features
// and https://github.com/Mottie/github-reserved-names/blob/master/reserved-names.json and
// https://github.com/Mottie/github-reserved-names and random other things.
// If you add more and want to clean this up in the console, this may be helpful:
//       Array.from(RESERVED).sort().join(' ')
const RESERVED = new Set(
  `0 400 401 402 403 404 405 406 407 408 409 410 411 412 413 414 415 416 417 418 419 420 421 422 423 424 425 426 427 428 429 430 431 500 501 502 503 504 505 506 507 508 509 510 511 about access account accounts activate activities activity ad add address adm admin administration administrator ads adult advertising advisories affiliate affiliates ajax alive all alpha analysis analytics android anon anonymous any api app apps archive archives article articles asct asset assets atom attributes auth authentication avatar backup balancer-manager banner banners beta better billing bin blob blobs blog blogs board book bookmark bot bots bounty branches bug business businesses c cache cadastro calendar call campaign cancel captcha career careers cart case-studies categories category cdn central certification cgi cgi-bin changelog chat check checking checkout cla client cliente clients cloud cocalc cocksucker code codereview collection collections comercial comment comments commit commits communities community companies company compare compras config configuration connect contact contact-us contact_us contactus contest contribute contributing cookbook cookies corp coupons create css cunt customer customer-stories customers customize dashboard dashboards data db default delete demo design designer destroy dev devel develop developer developers diagram diary dict dictionary die diff dir direct_messages directory discover discussions dist doc docs documentation domain download downloads downtime ecommerce edit editor editors edu education email embed employment empty end enterprise entries entry error errors eval event events exit explore facebook faq favorite favorites feature featured features feed feedback feeds file files first fixtures flash fleet fleets flog follow followers following font fonts forgot forked form forum forums founder free friend friends ftp fuck gadget gadgets game games garage get ghost gift gifts gist gists github graph graphs group groups guest guests guide guides help help-wanted home homepage hooks host hosting hostmaster hostname hovercards howto hpg html http httpd https hub i iamges icon icons id idea ideas identity image images imap img inbox include includes index indice individual info information inquiry instagram integration interfaces intern internal intranet introduction invalid-email-address investors invitations invite invoice ipad iphone irc is issue issues it item items java javascript job jobs join journal journals js json jump knowledgebase lab labs language languages last launch layouts ldap-status learn legal library license link links linux list listings lists log log-in log-out log_in log_out login logos logout logs m mac mail mail1 mail2 mail3 mail4 mail5 mailer mailing maintenance malware man manager manual map maps marketing marketplace master me media member members mention mentioned mentioning mentions message messages messenger microblog microblogs migrating milestones mine mirrors mis misc mob mobile module modules monitor motherfucker movie movies mp3 msg msn music musicas mx my mysql name named nan navi navigation net network new news newsletter nick nickname node nodes none nonprofit nonprofits notes notices noticias notification notifications notify ns ns1 ns10 ns2 ns3 ns4 ns5 ns6 ns7 ns8 ns9 null oauth oauth_clients offer offers office official old online open-source openid operator order orders organisations organization organizations orgs overview owner owners page pager pages panel partners password payment payments perl personal phone photo photoalbum photos php phpmyadmin phppgadmin phpredisadmin pic pics ping piss plan plans plugin plugins policies policy poll polls pop pop3 popular popularity portal post postfix postmaster posts pr premium press price pricing primus privacy privacy-policy privacy_policy privacypolicy private processes product products professional profile profiles project projects promo pub public pulls purpose put python query random ranking raw rdf rdfs read readme recent recommendations recruit recruitment redeem register registration release releases remove render replies reply report reports repositories repository req request requests reset resources restore revert roc root rss ruby rule sag sagemath sagemathinc sale sales sample samples save save-net-neutrality saved school scraping script scripts search secure security self send server server-info server-status service services session sessions setting settings setup share shareholders shit shop show showcases sign-in sign-up sign_in sign_up signin signout signup site sitemap sites smartphone smtp snapshots software soporte source spam spec special sponsors sql src ssh ssl ssladmin ssladministrator sslwebmaster staff stage staging starred stars start stat state static statistics stats status statuses storage store stores stories style styleguide stylesheet stylesheets subdomain subscribe subscriptions suggest suggestion suggestions suporte support survey surveys suspended svn swf sys sysadmin sysadministrator system tablet tablets tag talk talks task tasks teach teacher teachers teaching team teams tech telnet template templates ten term terms terms-of-service terms_of_service termsofservice test test1 test2 test3 teste testing tests theme themes thread threads timeline timetravel tits tmp todo tool tools top topic topics tos tour train training translations tree trending trends tutorial tutorials tux tv twitter twittr undef unfollow unsubscribe update updates upload uploads url usage user username users usuario vendas ver version video videos visitor visualization w watch watching weather web webapp webhook webhooks webmail webmaster website websites welcome widget widgets wiki win windows word work works works-with workshop ww wws www www0 www1 www2 www3 www4 www5 www6 www7 www8 www9 wwws wwww xfn xml xmpp xpg xxx yaml year yml you yourdomain yourname yoursite yourusername`.split(
    /\s+/
  )
);
