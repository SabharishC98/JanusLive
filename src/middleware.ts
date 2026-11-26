import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const response = NextResponse.next();
  const existingCookie = req.cookies.get('pwnlab_identity');

  if (!existingCookie) {
    const newId = crypto.randomUUID();
    response.cookies.set('pwnlab_identity', newId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
