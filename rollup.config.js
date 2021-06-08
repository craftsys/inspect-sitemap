import pkg from "./package.json";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import { preserveShebangs } from "rollup-plugin-preserve-shebangs";
import commonjs from "@rollup/plugin-commonjs";

export default [
  // CommonJS (for Node) and ES module (for bundlers) build.
  {
    input: "src/index.ts",
    output: [
      {
        file: pkg.main,
        format: "cjs",
        exports: "auto",
      },
      {
        file: pkg.module,
        format: "es",
        // external: ["node-fetch", "cli-progress", "node-html-parser", "colors"],
      },
    ],
    external: ["node-fetch", "cli-progress", "node-html-parser", "colors"],
    plugins: [typescript({ sourceMap: false })],
  },
  // CLI CommonJS (for Node)
  {
    input: "src/cli/index.ts",
    output: {
      name: "inspect-sitemap",
      file: pkg.bin["inspect-sitemap"],
      format: "cjs",
    },
    plugins: [
      preserveShebangs(),
      typescript({ sourceMap: false }),
      commonjs(),
      nodeResolve({
        exportConditions: ["node"],
      }),
      json(),
    ],
  },
];
