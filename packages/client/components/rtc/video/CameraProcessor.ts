import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
} from "@livekit/track-processors";

import { CONFIGURATION } from "@revolt/common";
import type {
  CameraBackgroundMode,
  CameraBackgroundPreset,
} from "@revolt/state/stores/Voice";

/**
 * Whether this browser can run camera background effects at all
 * (WebGL2, OffscreenCanvas, etc). Checked once up front so the effects
 * menu/settings can hide or disable the option instead of it silently
 * failing when picked.
 */
export function cameraEffectsSupported(): boolean {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
}

/**
 * Build the asset paths for the MediaPipe segmenter, honouring the
 * self-hosting overrides configured via VITE_CAMERA_SEGMENTER_*_URL - if
 * unset, @livekit/track-processors falls back to its own CDN defaults
 * (jsDelivr for the WASM fileset, Google's hosted model).
 *
 * @livekit/track-processors only falls through to its CDN default when
 * the option key is missing/undefined, not when it's an empty string -
 * so an unset override must actively omit the key here, not just set it
 * to "". This can't be written as a plain `if (CONFIGURATION.X) {...}`
 * though: Vite inlines CONFIGURATION.X (built from
 * import.meta.env.VITE_X) as a build-time constant, and since this repo
 * builds with literal placeholder strings like "__VITE_X__" for runtime
 * injection (see docker/inject.js), that placeholder is always truthy at
 * build time - dead-code elimination then either strips the branch
 * entirely or folds it to "always assign", silently breaking the runtime
 * substitution this depends on. Routing the value through a helper Vite
 * can't statically evaluate keeps the check live until actual runtime.
 */
function undefinedIfBlank(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function assetPaths() {
  return {
    tasksVisionFileSet: undefinedIfBlank(
      CONFIGURATION.CAMERA_SEGMENTER_WASM_URL,
    ),
    modelAssetPath: undefinedIfBlank(CONFIGURATION.CAMERA_SEGMENTER_MODEL_URL),
  };
}

function presetImagePath(preset: CameraBackgroundPreset) {
  return `${import.meta.env.BASE_URL}backgrounds/${preset}.svg`;
}

/**
 * Build a fresh background processor for the given camera effect
 * settings, or undefined if no effect should be applied (mode: "none"),
 * the browser doesn't support it, or construction fails for any other
 * reason (e.g. the segmentation model/WASM fails to load). Never throws -
 * callers should treat undefined as "just use the plain camera feed",
 * not as an error to surface to the user.
 */
export function createCameraProcessor(
  mode: CameraBackgroundMode,
  blurRadius: number,
  backgroundPreset: CameraBackgroundPreset,
): BackgroundProcessorWrapper | undefined {
  if (mode === "none" || !cameraEffectsSupported()) return undefined;

  try {
    if (mode === "blur") {
      return BackgroundProcessor({
        mode: "background-blur",
        blurRadius,
        assetPaths: assetPaths(),
      });
    }

    return BackgroundProcessor({
      mode: "virtual-background",
      imagePath: presetImagePath(backgroundPreset),
      assetPaths: assetPaths(),
    });
  } catch (e) {
    console.warn("Failed to create camera background processor", e);
    return undefined;
  }
}

/**
 * Switch an already-attached background processor to new settings live,
 * without tearing down and reloading the segmentation model. Never
 * throws; returns whether the switch succeeded so the caller can fall
 * back (e.g. tear down and continue with the plain camera feed) if not.
 */
export async function switchCameraProcessor(
  processor: BackgroundProcessorWrapper,
  mode: CameraBackgroundMode,
  blurRadius: number,
  backgroundPreset: CameraBackgroundPreset,
): Promise<boolean> {
  try {
    if (mode === "none") {
      await processor.switchTo({ mode: "disabled" });
    } else if (mode === "blur") {
      await processor.switchTo({ mode: "background-blur", blurRadius });
    } else {
      await processor.switchTo({
        mode: "virtual-background",
        imagePath: presetImagePath(backgroundPreset),
      });
    }
    return true;
  } catch (e) {
    console.warn("Failed to switch camera background processor", e);
    return false;
  }
}
