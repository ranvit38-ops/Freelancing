import { NextResponse, type NextRequest } from 'next/server';

/**
 * Hands the requested address to the not-found page, which has no other way to
 * learn it. When a link points at a record in another of the person's labs,
 * that page offers to switch instead of only saying "not in this lab".
 *
 * Only on record pages, and the header is always overwritten here, never
 * taken from the request as sent.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-labquill-path', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/projects/:path+',
    '/experiments/:path+',
    '/protocols/:path+',
    '/samples/:path+',
    '/tasks/:path+',
    '/docs/:path+',
    '/datasets/:path+',
    '/updates/:path+',
    '/inventory/:path+',
  ],
};
