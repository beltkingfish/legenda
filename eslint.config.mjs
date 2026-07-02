// ESLint 9 flat config. Uses Adobe's Premiere UXP plugin in its type-checked
// tier (per its README), which needs typescript-eslint's project service.
import premierepro from "@adobe/eslint-plugin-premierepro";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  ...tseslint.configs.recommended,
  premierepro.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // UXP exposes host modules only through CommonJS require() — the
      // pattern documented in @adobe/premierepro's README.
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: ["^premierepro$", "^uxp$"] },
      ],
    },
  },
  // The config file itself is not part of the TS project; skip typed linting.
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  }
);
