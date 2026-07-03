// UXP file access (localFileSystem permission in manifest.json).
// API verified against @adobe/cc-ext-uxp-types: storage.localFileSystem
// .getFileForOpening({types}) → File → file.read() (utf8 by default).
// The defs type these returns as `any`, so we narrow them locally.

interface UxpFile {
  name: string;
  /** Platform-native filesystem path — the bridge to host APIs that take paths. */
  nativePath: string;
  read(options?: { format?: symbol }): Promise<string | ArrayBuffer>;
}

interface UxpFolder {
  getEntry(path: string): Promise<UxpFile>;
  createFile(name: string, options?: { overwrite?: boolean }): Promise<
    UxpFile & {
      write(data: string | ArrayBuffer, options?: { format?: symbol }): Promise<void>;
    }
  >;
}

interface UxpLocalFileSystem {
  getFileForOpening(options: {
    types?: string[];
    allowMultiple?: boolean;
  }): Promise<UxpFile | UxpFile[] | null | undefined>;
  getPluginFolder(): Promise<UxpFolder>;
  getTemporaryFolder(): Promise<UxpFolder>;
  /** Per-plugin persistent storage (survives sessions and projects). */
  getDataFolder(): Promise<UxpFolder>;
}

const { localFileSystem, formats } = (
  require("uxp") as {
    storage: {
      localFileSystem: UxpLocalFileSystem;
      formats: { binary: symbol; utf8: symbol };
    };
  }
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

/** Open a picker for a .mogrt file; the native path feeds insertMogrtFromPath. */
export async function pickMogrtFile(): Promise<{ name: string; path: string } | null> {
  const picked = await localFileSystem.getFileForOpening({ types: ["mogrt"] });
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) {
    return null;
  }
  return { name: file.name, path: file.nativePath };
}

/** Read a file shipped inside the plugin folder (e.g. the caption template). */
export async function readPluginFile(relativePath: string): Promise<Uint8Array> {
  const pluginFolder = await localFileSystem.getPluginFolder();
  const entry = await pluginFolder.getEntry(relativePath);
  const data = await entry.read({ format: formats.binary });
  if (typeof data === "string") {
    throw new Error(`Expected binary read for ${relativePath}`);
  }
  return new Uint8Array(data);
}

/**
 * Read a UTF-8 text file from the plugin data folder; null when it does not
 * exist yet (getEntry throws for missing entries).
 */
export async function readDataFile(name: string): Promise<string | null> {
  const dataFolder = await localFileSystem.getDataFolder();
  let entry: UxpFile;
  try {
    entry = await dataFolder.getEntry(name);
  } catch {
    return null; // never saved
  }
  const text = await entry.read();
  return typeof text === "string" ? text : null;
}

/** Write a UTF-8 text file into the plugin data folder. */
export async function writeDataFile(name: string, text: string): Promise<void> {
  const dataFolder = await localFileSystem.getDataFolder();
  const file = await dataFolder.createFile(name, { overwrite: true });
  await file.write(text, { format: formats.utf8 });
}

/**
 * Write bytes to the UXP temporary folder (auto-cleaned when the plugin is
 * disposed) and return the platform-native path for host APIs.
 */
export async function writeTempFile(name: string, bytes: Uint8Array): Promise<string> {
  const temp = await localFileSystem.getTemporaryFolder();
  const file = await temp.createFile(name, { overwrite: true });
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  await file.write(buffer, { format: formats.binary });
  return file.nativePath;
}
