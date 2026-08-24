import { ClipboardCheck, Droplet, HardHat, LayoutDashboard, MapPin, Receipt, Truck, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/excavators", label: "Machines", icon: Truck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/operators", label: "Operators", icon: HardHat },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/operators/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/site-analysis", label: "Site Analysis", icon: MapPin },
  { href: "/diesel-checker", label: "Diesel Checker", icon: Droplet },
] as const;

/** "/operators/approvals" starts with both "/operators" and itself — prefer
 * whichever nav item's href is the longer (more specific) match so only one
 * tab highlights at a time. */
export function isNavItemActive(pathname: string, href: string) {
  if (!pathname.startsWith(href)) return false;
  return !NAV_ITEMS.some((other) => other.href !== href && other.href.length > href.length && pathname.startsWith(other.href));
}
