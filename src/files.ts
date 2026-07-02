// UXP file access (localFileSystem permission in manifest.json).
// API verified against @adobe/cc-ext-uxp-types: storage.localFileSystem
// .getFileForOpening({types}) → File → file.read() (utf8 by default).
// The defs type these returns as `any`, so we narrow them locally.

interface UxpFile {
  name: string;
  read(options?: { format?: symbol }): Promise<string | ArrayBuffer>;
}

interface UxpLocalFileSystem {
  getFileForOpening(options: {
    types?: string[];
    allowMultiple?: boolean;
  }): Promise<UxpFile | UxpFile[] | null | undefined>;
}

const { localFileSystem } = (
  require("uxp") as { storage: { localFileSystem: UxpLocalFileSystem } }
).storage;

/** Open a picker for an .srt file; null when the user cancels. */
export async function pickSrtFile(): Promise<{ name: string; text: string } | null> {
  const picked = await localFileSystem.getFileForOpening({ types: ["srt"] });
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) {
    return null;
  }
  const text = await file.read();
  if (typeof text !== "string") {
    throw new Error(`Could not read "${file.name}" as text.`);
  }
  return { name: file.name, text };
}
