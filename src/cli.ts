#!/usr/bin/env bun

if (typeof Bun == "undefined")
  throw new Error(
    "This executable requires Bun. If you're using `bunx`, try `bunx --bun`."
  );

import minimist from "minimist";
import { bfrBuild } from "./build";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import z from "zod/v4";
import { brfServe } from "./serve";
import { input, select } from "@inquirer/prompts";
import { bfrInit } from "./init";

const BuildOptions = z.object({
  path: z.string().default("./src/app"),
  outdir: z.string().optional(),
  relativePublicPath: z.boolean().default(false),
  minify: z.boolean().default(true),
  splitting: z.boolean().default(false),
  sourcemap: z
    .union([
      z.literal(false),
      z.literal("none"),
      z.literal("inline"),
      z.literal("linked"),
      z.literal("external"),
    ])
    .default("linked"),
});

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, "bun-fs-router.yaml");
const config = await (async () => {
  try {
    const configFile = await fs.readFile(configPath).then(
      (buf) => buf.toString("utf-8"),
      () => {}
    );
    return BuildOptions.parse(configFile ? yaml.load(configFile) : {});
  } catch (e) {
    console.error(
      "Configuration file is invalid:",
      e instanceof Error ? e.message : `${e}`
    );
    process.exit(1);
  }
})();

const argv = minimist(process.argv.slice(3), {
  string: ["outdir", "path"],
  boolean: ["relativePublicPath", "minify", "splitting", "test", "keepTemp"],
  alias: {
    outdir: ["o"],
    relativePublicPath: ["relative-public-path"],
    keepTemp: ["keep-temp"],
  },
});

if (process.argv[2] == "build") {
  console.log(config, argv);

  const outdir = argv.outdir ?? config.outdir;
  if (typeof outdir == "undefined")
    throw new Error(
      "An output directory is required. Use `--outdir` in the CLI or `outdir` in `bun-fs-router.yaml`."
    );

  const inter = await fs.mkdtemp(path.join(projectRoot, ".bfr-"));
  await bfrBuild(
    path.resolve(projectRoot, argv.path ?? config.path),
    inter,
    argv.outdir,
    {
      relativePublicPath: argv.relativePublicPath || config.relativePublicPath,
      minify: argv.minify || config.minify,
      splitting: argv.splitting || config.splitting,
      sourcemap: argv.sourcemap || config.sourcemap,
    }
  );
  await fs.rm(inter, { recursive: true, force: true });
} else if (process.argv[2] == "serve") {
  const inter = await fs.mkdtemp(path.join(projectRoot, ".bfr-"));
  await brfServe(path.resolve(projectRoot, argv.path ?? config.path), inter, {
    relativePublicPath: argv.relativePublicPath || config.relativePublicPath,
    minify: argv.minify || config.minify,
    splitting: argv.splitting || config.splitting,
    sourcemap: argv.sourcemap || config.sourcemap,
  });
  await fs.rm(inter, { recursive: true, force: true });
} else if (process.argv[2] == "init") {
  const here = process.cwd();
  const packageName = await input({
    message: "Package name",
    default: path.basename(here),
  });
  const location = await select({
    message: "Where to?",
    choices: [
      { name: "Directly in this directory", value: here },
      {
        name: "In a new subdirectory with the project's name",
        value: path.join(here, packageName),
      },
    ],
  });
  console.log("\nCreating new project...");
  await fs.mkdir(location);
  await bfrInit(location, packageName);
  console.log(`\x1b[F\x1b[2KCreated new bun-fs-router project.

Next steps:
- \`bun install\` to install dependencies
- \`bun run dev\` to start serving the application`);
}
