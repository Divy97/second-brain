import { config } from "@workspace/eslint-config/base"

/** @type {import("eslint").Linter.Config[]} */
export default [{ ignores: ["worker-configuration.d.ts"] }, ...config]
