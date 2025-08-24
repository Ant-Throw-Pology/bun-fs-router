import fs from "node:fs/promises";
import { join } from "node:path";
import bfrPackage from "../package.json";

export async function bfrInit(dir: string, packageName: string) {
  await fs.mkdir(join(dir, "src/app"), { recursive: true });
  await Promise.all([
    fs.writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: packageName,
          type: "module",
          private: true,
          devDependencies: {
            "@types/bun": "latest",
            "@types/react": bfrPackage.devDependencies["@types/react"],
            "@types/react-dom": bfrPackage.devDependencies["@types/react-dom"],
            "bun-fs-router": "^" + bfrPackage.version,
          },
          dependencies: {
            react: bfrPackage.peerDependencies.react,
            "react-dom": bfrPackage.peerDependencies["react-dom"],
          },
          scripts: {
            build: "NODE_ENV=production bfr build -o build",
            dev: "bfr serve",
            "build-dev": "bfr build -o build",
          },
        },
        undefined,
        "  "
      )
    ),
    fs.writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            // Environment setup & latest features
            lib: ["ESNext", "DOM"],
            target: "ESNext",
            module: "Preserve",
            moduleDetection: "force",
            jsx: "react-jsx",
            allowJs: true,

            // Bundler mode
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            verbatimModuleSyntax: true,
            noEmit: true,

            // Best practices
            strict: true,
            skipLibCheck: true,
            noFallthroughCasesInSwitch: true,
            noUncheckedIndexedAccess: true,
            noImplicitOverride: true,

            // Some stricter flags (disabled by default)
            noUnusedLocals: false,
            noUnusedParameters: false,
            noPropertyAccessFromIndexSignature: false,
          },
        },
        undefined,
        "  "
      )
    ),
    fs.writeFile(
      join(dir, "bun-fs-router.yaml"),
      `path: src/app
`
    ),
    fs.writeFile(
      join(dir, "src/app/index.tsx"),
      `import React from "react";

export default function App() {
  return <h1>Hello world!</h1>;
}
`
    ),
    fs.writeFile(
      join(dir, ".gitignore"),
      `build
node_modules
.bfr*`
    ),
  ]);
}
