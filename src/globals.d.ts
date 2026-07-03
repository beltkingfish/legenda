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

// UXP provides TextEncoder/TextDecoder at runtime; the defs omit them.
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string);
  decode(input: ArrayBuffer | ArrayBufferView): string;
}
