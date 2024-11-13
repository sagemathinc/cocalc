import { LOCALES } from "locales/consts";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  for (const locale of LOCALES) {
    if (request.nextUrl.pathname.startsWith(`/${locale}`)) {
      return NextResponse.rewrite(new URL(`/lang/${locale}`, request.url));
    }
  }
}
