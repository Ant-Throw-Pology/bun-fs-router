import { build } from "bun";
import path from "node:path";
import { prerenderToNodeStream } from "react-dom/static";
import { getRoutes } from "./getRoutes";
import DefaultLayout from "./default-layout";
import { findUpwards } from "./util";
import fs from "node:fs/promises";
import React from "react";

const defaultLayoutPath = path.join(import.meta.dir, "./default-layout.tsx");

export async function bfrBuild(
  base: string,
  filesDir: string,
  outputDir: string,
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
  const routes = await getRoutes(base);

  await fs.rm(outputDir, { force: true, recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  for (const route of routes) {
    const pathname = route.rawRoute;
    const publicPath = path.join(
      relativePublicPath ? path.relative(pathname, "/") || "." : "/",
      "/__/files/",
      pathname,
      "./"
    );
    console.log({ publicPath });
    const serverResult = await build({
      entrypoints: [route.path],
      external: ["react", "react-dom"], // prevent "Invalid hook call" errors
      target: "browser",
      publicPath,
    });
    const serverIndex = serverResult.outputs.find(
      (artifact) => artifact.kind == "entry-point"
    );
    if (!serverIndex) throw new Error("Bun did not output an entrypoint. wtf?");
    const serverIndexPath = path.join(
      filesDir,
      "build-server-files",
      pathname,
      `index-${[...Bun.SHA256.hash(serverIndex)].map((b) => b.toString(16).padStart(2, "0")).join("")}.js`
    );
    await Bun.write(serverIndexPath, serverIndex);

    const { default: App } = await import(serverIndexPath);

    const layoutPath = await findUpwards(
      route.path,
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
import App from '${route.path}';
import Layout from '${layoutPath ?? defaultLayoutPath}';

hydrateRoot(
  document,
  <React.StrictMode>
    <Layout>
      <App pathParams={{}} />
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
      target: "browser",
      publicPath,
      splitting,
      // root: base,
      plugins: [
        {
          name: "bun-fs-router min-runtime styling",
          setup(build) {
            build.onLoad({ filter: /^bun-fs-router\/styling$/ }, (args) => {});
          },
        },
      ],
    });
    for (const artifact of result.outputs) {
      const dest = path.join(
        outputDir,
        "/__/files/",
        pathname,
        path.basename(artifact.path)
      );
      console.log({ kind: artifact.kind, path: artifact.path, dest });
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

    const { prelude } = await prerenderToNodeStream(
      <React.StrictMode>
        <Layout>
          <App pathParams={{}} />
        </Layout>
      </React.StrictMode>,
      {
        bootstrapScripts: [path.join(publicPath, "index.js")],
      }
    );

    const htmlDest = path.join(outputDir, pathname, "index.html");
    await fs.mkdir(path.dirname(htmlDest), { recursive: true });
    await fs.writeFile(htmlDest, prelude);
  }
}
