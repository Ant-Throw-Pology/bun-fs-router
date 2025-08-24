import { build, serve } from "bun";
import { renderToReadableStream } from "react-dom/server";
import path from "node:path";
import fs from "node:fs/promises";
import DefaultLayout from "./default-layout";
import React from "react";
import { compareSpecificity, findUpwards } from "./util";
import { getRoutes, type RouteInfo } from "./getRoutes";

const defaultLayoutPath = path.join(import.meta.dir, "./default-layout.tsx");

export async function brfServe(
  base: string,
  filesDir: string,
  {
    relativePublicPath,
    minify,
    splitting,
    sourcemap,
  }: {
    relativePublicPath: boolean;
    minify: boolean;
    splitting: boolean;
    sourcemap: false | "none" | "inline" | "linked" | "external";
  }
) {
  await fs.rm(filesDir, { force: true, recursive: true });
  await fs.mkdir(filesDir, { recursive: true });

  const routes = await getRoutes(base);

  const server = serve({
    async fetch(request, server) {
      const start = Bun.nanoseconds();
      const { pathname } = new URL(request.url);
      try {
        if (pathname.startsWith("/__/files/")) {
          const filePath = path.join(
            filesDir,
            "serve-files",
            path.relative("/__/files/", pathname)
          );

          try {
            if ((await fs.stat(filePath)).isFile())
              return new Response(Bun.file(filePath));
          } catch (e) {}
        }
        let bestRoute: RouteInfo | undefined,
          bestRouteMatch: RegExpMatchArray | undefined;
        for (const route of routes) {
          const match = pathname.match(route.matcher);
          if (!match) continue;
          if (
            !bestRoute ||
            !bestRouteMatch ||
            compareSpecificity(route.specificity, bestRoute.specificity) > 0
          ) {
            bestRoute = route;
            bestRouteMatch = match;
          }
        }
        if (!bestRoute || !bestRouteMatch)
          return new Response("404", { status: 404 });
        const publicPath = path.join(
          relativePublicPath ? path.relative(pathname, "/") || "." : "/",
          "/__/files/",
          pathname,
          "./"
        );
        const serverResult = await build({
          entrypoints: [bestRoute.path],
          external: ["react", "react-dom"], // prevent "Invalid hook call" errors
          target: "browser",
          publicPath,
        });
        const serverIndex = serverResult.outputs.find(
          (artifact) => artifact.kind == "entry-point"
        );
        if (!serverIndex)
          throw new Error("Bun did not output an entrypoint. wtf?");
        const serverIndexPath = path.join(
          filesDir,
          "serve-server-files",
          pathname,
          `index-${[...Bun.SHA256.hash(serverIndex)].map((b) => b.toString(16).padStart(2, "0")).join("")}.js`
        );
        await Bun.write(serverIndexPath, serverIndex);

        const { default: App, handleFetch } = await import(serverIndexPath);

        if (typeof handleFetch == "function") {
          return Promise.resolve(handleFetch(request));
        }

        const layoutPath = await findUpwards(
          bestRoute.path,
          base,
          /\/layout\.[jt]sx?$/
        );
        let Layout = DefaultLayout;
        if (layoutPath) {
          const module = await import(layoutPath);
          if (typeof module.default == "function") Layout = module.default;
        }
        const importerSrc = `import { hydrateRoot } from 'react-dom/client';
import React from 'react';
import App from '${bestRoute.path}';
import Layout from '${layoutPath ?? defaultLayoutPath}';

hydrateRoot(
  document,
  <React.StrictMode>
    <Layout>
      <App pathParams={${JSON.stringify(bestRouteMatch.groups || {})}} />
    </Layout>
  </React.StrictMode>
);`;
        const importerPath = path.join(
          filesDir,
          "serve-importers",
          pathname,
          "index.js"
        );
        await fs.mkdir(path.dirname(importerPath), { recursive: true });
        await fs.writeFile(importerPath, importerSrc);
        const result = await build({
          entrypoints: [importerPath],
          minify,
          sourcemap,
          splitting,
          target: "browser",
          publicPath,
          // root: base,
        });
        for (const artifact of result.outputs) {
          const dest = path.join(
            filesDir,
            "serve-files",
            pathname,
            path.basename(artifact.path)
          );
          console.log(artifact.kind, artifact.path, dest);
          await fs.mkdir(path.dirname(dest), { recursive: true });

          // fix one VERY specific edge case where devtools ends up requesting /__/files/__/files/index.js.map
          if (
            relativePublicPath &&
            sourcemap == "linked" &&
            artifact.kind == "entry-point" &&
            dest.endsWith("index.js")
          ) {
            await Bun.write(
              dest,
              (await artifact.text()).replace(
                /\/\/# sourceMappingURL=__\/files\//,
                "//# sourceMappingURL="
              )
            );
          } else await Bun.write(dest, artifact);
        }

        return new Response(
          await renderToReadableStream(
            <React.StrictMode>
              <Layout>
                <App pathParams={bestRouteMatch.groups || {}} />
              </Layout>
            </React.StrictMode>,
            {
              bootstrapScripts: [path.join(publicPath, "index.js")],
            }
          ),
          {
            headers: { "Content-Type": "text/html" },
          }
        );
      } finally {
        const end = Bun.nanoseconds();
        console.log(request.method, pathname, "in", end - start, "ns");
      }
    },
  });

  console.log(`Server running at http://localhost:${server.port}/`);

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      console.log("Stopping...");
      server.stop(true);
      resolve();
    });
  });
}
