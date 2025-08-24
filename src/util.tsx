import fs from "node:fs/promises";
import path from "path";

export async function findUpwards(from: string, to: string, matcher: RegExp) {
  const dir = path.dirname(from);
  for (const item of await fs.readdir(dir)) {
    const itemPath = path.join(dir, item);
    if (matcher.test(itemPath)) {
      return itemPath;
    }
  }
  if (path.relative(dir, to) != "") {
    return findUpwards(dir, to, matcher);
  }
}

export async function findAllUpwards(
  from: string,
  to: string,
  matcher: RegExp,
  onePerLevel: boolean = false
) {
  let dir = from;
  const results = [];
  while (((dir = path.dirname(dir)), path.relative(dir, to) != "")) {
    for (const item of await fs.readdir(dir)) {
      const itemPath = path.join(dir, item);
      if (matcher.test(itemPath)) {
        results.push(itemPath);
        if (onePerLevel) break;
      }
    }
  }
  return results;
}

export function compareSpecificity(a: number[], b: number[]) {
  if (a.length == 0) {
    if (b.length == 0) {
      return 0;
    } else {
      return -1;
    }
  } else if (b.length == 0) {
    return 1;
  } else if (a[0] == b[0]) return compareSpecificity(a.slice(1), b.slice(1));
  else return (a[0] ?? 0) - (b[0] ?? 0);
}
