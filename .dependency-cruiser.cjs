const { basename, join } = require("node:path")

const workspace = basename(process.cwd())

const layering = {
  web: [
    {
      name: "web-never-touches-db-or-ai",
      severity: "error",
      comment: "The web app reaches data and models only through the API.",
      from: {},
      to: { path: "^\\.\\./\\.\\./packages/(db|ai)/" },
    },
  ],
  api: [
    {
      name: "api-never-imports-ui",
      severity: "error",
      from: {},
      to: { path: "^\\.\\./\\.\\./packages/ui/" },
    },
  ],
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Dependency cycles make modules impossible to reason about or test in isolation.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-imports-from-apps",
      severity: "error",
      comment:
        "Apps are deployables, not libraries. Shared code belongs in packages/.",
      from: {},
      to: { path: "^\\.\\./\\.\\./apps/" },
    },
    {
      name: "no-relative-cross-package-imports",
      severity: "error",
      comment:
        "Cross-package imports use the package specifier (@workspace/<name>), never a relative path.",
      from: {},
      to: {
        path: "^\\.\\./\\.\\./packages/",
        dependencyTypes: ["local"],
        dependencyTypesNot: ["aliased"],
      },
    },
    {
      name: "packages-are-deep-modules",
      severity: "error",
      comment:
        "A package's public surface is the root of its src/ (plus the folders @workspace/ui lists in its exports). Everything deeper is implementation.",
      from: {},
      to: {
        path: "^\\.\\./\\.\\./packages/[^/]+/src/.+/[^/]+$",
        pathNot: [
          "^\\.\\./\\.\\./packages/ui/src/(components|hooks|lib)/[^/]+\\.tsx?$",
          "\\.css$",
        ],
      },
    },
    {
      name: "no-test-imports-from-source",
      severity: "error",
      from: { pathNot: "\\.test\\.tsx?$" },
      to: { path: "\\.test\\.tsx?$" },
    },
    ...(layering[workspace] ?? []),
  ],
  options: {
    doNotFollow: { path: ["node_modules"] },
    exclude: {
      path: [
        "node_modules",
        "\\.next",
        "\\.turbo",
        "/dist/",
        "/coverage/",
        "\\.config\\.(ts|js|mjs|cjs)$",
        "\\.d\\.ts$",
      ],
    },
    tsPreCompilationDeps: true,
    // Run from each workspace so its own tsconfig aliases resolve. Absolute path: TypeScript
    // reports "no inputs" when the config path is relative and the base directory is not.
    tsConfig: { fileName: join(process.cwd(), "tsconfig.json") },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
