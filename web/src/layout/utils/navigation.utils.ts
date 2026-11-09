export function isRouteActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}
