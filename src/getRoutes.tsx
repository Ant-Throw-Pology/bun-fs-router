import fs from "node:fs/promises";
import path from "path";

export interface RouteInfo {
  matcher: RegExp;
  path: string;
  specificity: number[];
  rawRoute: string;
}
export async function getRoutes(base: string): Promise<RouteInfo[]> {
  return (await fs.readdir(base, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^index\.[jt]sx?$/.test(entry.name))
    .map((entry) => {
      const rel = path.relative(base, entry.parentPath);
      const rawRoute = rel
        .replace(/^[./]+/, "")
        .replace(/\([^/)]*\)/g, "")
        .replace(/\/+/g, "/");
      const parts = rawRoute.split("/").map((part) => {
        if (part.startsWith("[") && part.endsWith("]")) {
          let m;
          if ((m = part.match(/^\[([\w\d_$]+):((?:\|[^/|:[\\\]]+)+)\]$/))) {
            return {
              specificity: 3,
              match: `(?<${m[1]!}>${m[2]!
                .slice(1)
                .split("|")
                .map((item) => RegExp.escape(item))
                .join("|")})`,
            };
          } else if ((m = part.match(/^\[([\w\d_$]+):number\]$/))) {
            return {
              specificity: 2,
              match: `(?<${m[1]!}>\\d+\\.\\d+|\\d+\\.|\\.\\d+|\\d+)`,
            };
          } else if ((m = part.match(/^\[([\w\d_$]+)(?::\*)?\]$/))) {
            return {
              specificity: 1,
              match: `(?<${m[1]!}>[^/]*)`,
            };
          } else if ((m = part.match(/^\[([\w\d_$]+):\*\*\]$/))) {
            return {
              specificity: 0,
              match: `(?<${m[1]!}>.*)`,
            };
          } else throw new Error("Invalid route parameter: " + part);
        } else
          return { type: "normal", specificity: 4, match: RegExp.escape(part) };
      });
      const specificity = parts.map((p) => p.specificity);
      return {
        matcher: new RegExp(`^/${parts.map((part) => part.match).join("/")}\$`),
        path: path.join(entry.parentPath, entry.name),
        specificity,
        rawRoute: "/" + rawRoute,
      };
    });
}
