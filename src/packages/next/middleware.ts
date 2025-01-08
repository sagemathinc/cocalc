import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { LOCALE } from "locales/misc";

export function middleware(request: NextRequest) {
  // check the incoming request's URL path for known locales and rewrites the URL to a `/lang/[locale]`.
  // Otherwise, the `/[owner]` route will be used!
  for (const locale of LOCALE) {
    if (request.nextUrl.pathname.startsWith(`/${locale}`)) {
      return NextResponse.rewrite(new URL(`/lang/${locale}`, request.url));
    }

    // This normalizes /lang/[locale] and /lang/[locale]/foo to /[locale] and /[locale]/foo
    if (request.nextUrl.pathname.startsWith(`/lang/${locale}`)) {
      return NextResponse.redirect(
        new URL(
          request.nextUrl.pathname.replace(`/lang/${locale}`, `/${locale}`),
          request.url,
        ),
      );
    }
  }
}
