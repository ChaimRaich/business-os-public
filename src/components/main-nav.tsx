"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREAS } from "@/lib/nav";

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** `children` (theme toggle, sign-out) sit at the end of the top row. */
export function MainNav({ canManage, children }: { canManage: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  const areas = AREAS.filter((area) => canManage || !area.managersOnly);
  const active = areas.find((area) =>
    area.paths.length === 0 ? pathname === "/" : area.paths.some((prefix) => within(pathname, prefix)),
  );

  return (
    <>
      <nav aria-label="תחומי העסק" className="nav-in -mx-2 flex basis-full flex-wrap items-center lg:mx-0 lg:ms-auto lg:basis-auto lg:gap-1">
        {areas.map((area) => {
          const current = area === active;
          return (
            <Link
              key={area.href}
              href={area.href}
              aria-current={current ? "true" : undefined}
              className="nav-link text-base! font-medium"
            >
              {area.label}
            </Link>
          );
        })}
        {children}
      </nav>
      {active?.links && (
        <nav
          aria-label={active.label}
          className="-mx-2 flex basis-full flex-wrap items-center border-t border-line pt-2 lg:mx-0 lg:gap-1"
        >
          {active.links.map((link) => {
            const current = within(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className="nav-link"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
