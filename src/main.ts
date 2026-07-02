// Hello-sequence probe (Phase 1, step 1): confirms panel ↔ Premiere API wiring.
// Kept as a classic script (type-only `import()` references, no top-level
// import/export) so tsc emits no module wrapper — UXP loads this via <script>.
//
// API surface verified against @adobe/premierepro 26.3.0 type defs:
//   Project.getActiveProject(): Promise<Project>
//   Project#getActiveSequence(): Promise<Sequence>
//   Project#name, Sequence#name: readonly string

type PremiereProApi = import("@adobe/premierepro").premierepro;

const ppro = require("premierepro") as PremiereProApi;

const probeButton = document.getElementById("probe-button") as HTMLButtonElement;
const probeOutput = document.getElementById("probe-output") as HTMLElement;

async function runProbe(): Promise<string> {
  const project = await ppro.Project.getActiveProject();
  if (!project) {
    return "No project is open.";
  }
  const sequence = await project.getActiveSequence();
  if (!sequence) {
    return `Project: ${project.name}\nNo active sequence.`;
  }
  return `Project: ${project.name}\nSequence: ${sequence.name}`;
}

async function onProbeClick(): Promise<void> {
  probeButton.disabled = true;
  // className, not classList: UXP's type defs don't declare classList.
  probeOutput.className = "probe-output";
  probeOutput.textContent = "Checking…";
  try {
    probeOutput.textContent = await runProbe();
  } catch (err) {
    probeOutput.className = "probe-output is-error";
    probeOutput.textContent = `Premiere API error: ${
      err instanceof Error ? err.message : String(err)
    }`;
  } finally {
    probeButton.disabled = false;
  }
}

probeButton.addEventListener("click", () => {
  void onProbeClick();
});
