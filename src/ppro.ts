import type { premierepro } from "@adobe/premierepro";

// Single access point for the Premiere host module. UXP provides `require`
// at runtime; esbuild leaves this call in place because "premierepro" is
// marked external in the bundle.
const ppro = require("premierepro") as premierepro;

export default ppro;
