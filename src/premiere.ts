// Premiere-side glue for transcript ingress. API calls verified against
// @adobe/premierepro 26.3.0 defs + the premiere-api sample (PROJECT_STATUS,
// step-2 record):
//   Project.getActiveProject / Project#getActiveSequence
//   Sequence#getVideoTrackCount/getVideoTrack, getAudioTrackCount/getAudioTrack
//   Track#getTrackItems(Constants.TrackItemType.CLIP, false)
//   TrackItem#getProjectItem, ClipProjectItem.cast, ProjectItem#getId
//   Transcript.hasTranscript (sync), Transcript.exportToJSON (async)

import type {
  ClipProjectItem,
  Project,
  Sequence,
} from "@adobe/premierepro";
import ppro from "./ppro";

export interface ActiveContext {
  project: Project | null;
  sequence: Sequence | null;
}

export interface TranscribedClip {
  clip: ClipProjectItem;
  name: string;
}

export async function getActiveContext(): Promise<ActiveContext> {
  const project = await ppro.Project.getActiveProject();
  if (!project) {
    return { project: null, sequence: null };
  }
  const sequence = await project.getActiveSequence();
  return { project, sequence: sequence ?? null };
}

/**
 * Scan every clip on the sequence's video + audio tracks and return the
 * distinct project items that carry a transcript.
 */
export async function findTranscribedClips(sequence: Sequence): Promise<TranscribedClip[]> {
  const found: TranscribedClip[] = [];
  const seenIds = new Set<string>();

  const collect = async (trackItems: Array<{ getProjectItem(): Promise<unknown> }>) => {
    for (const trackItem of trackItems) {
      const projectItem = (await trackItem.getProjectItem()) as Parameters<
        typeof ppro.ClipProjectItem.cast
      >[0];
      if (!projectItem) {
        continue;
      }
      const id = projectItem.getId();
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      const clip = ppro.ClipProjectItem.cast(projectItem);
      if (clip && ppro.Transcript.hasTranscript(clip)) {
        found.push({ clip, name: projectItem.name });
      }
    }
  };

  const videoTrackCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < videoTrackCount; i++) {
    const track = await sequence.getVideoTrack(i);
    // Defs declare getTrackItems synchronous, but the premiere-api sample
    // awaits it — await is safe either way.
    await collect(await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false));
  }
  const audioTrackCount = await sequence.getAudioTrackCount();
  for (let i = 0; i < audioTrackCount; i++) {
    const track = await sequence.getAudioTrack(i);
    await collect(await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false));
  }

  return found;
}

export async function exportTranscriptJson(clip: ClipProjectItem): Promise<string> {
  return ppro.Transcript.exportToJSON(clip);
}
