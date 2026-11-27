import { NextResponse, type NextRequest } from "next/server";

// Files shared to the installed app are taken by the service worker (public/sw.js) before they
// reach the server. A share that does arrive here came before the worker was ready, and its files
// cannot be handed to the upload screen, so the screen asks for them again.
export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/receiving/new?shared=missed", request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/receiving/new", request.url), 303);
}
