// UXP provides CommonJS `require` at runtime (host modules like "premierepro"
// and local files). @adobe/cc-ext-uxp-types does not declare it, so we do.
// Callers narrow the result with a type assertion, per the pattern in
// @adobe/premierepro's README.
declare function require(id: string): unknown;

// UXP provides `console` at runtime (visible in UDT's debug console);
// @adobe/cc-ext-uxp-types omits it too.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

// NOTE: Premiere's UXP runtime has NO TextEncoder/TextDecoder globals
// (confirmed live 2026-07-02) — the type defs' omission is accurate there.
// Use fflate's strToU8/strFromU8 for UTF-8 instead.
