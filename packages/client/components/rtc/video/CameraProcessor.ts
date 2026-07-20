import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { BackgroundProcessor } from "@livekit/track-processors";

import { CONFIGURATION } from "@revolt/common";
import type {
  CameraBackgroundMode,
  CameraBackgroundPreset,
} from "@revolt/state/stores/Voice";

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
 * settings, or undefined if no effect should be applied (mode: "none").
 */
export function createCameraProcessor(
  mode: CameraBackgroundMode,
  blurRadius: number,
  backgroundPreset: CameraBackgroundPreset,
): BackgroundProcessorWrapper | undefined {
  if (mode === "none") return undefined;

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
}

/**
 * Switch an already-attached background processor to new settings live,
 * without tearing down and reloading the segmentation model.
 */
export function switchCameraProcessor(
  processor: BackgroundProcessorWrapper,
  mode: CameraBackgroundMode,
  blurRadius: number,
  backgroundPreset: CameraBackgroundPreset,
) {
  if (mode === "none") {
    return processor.switchTo({ mode: "disabled" });
  }
  if (mode === "blur") {
    return processor.switchTo({ mode: "background-blur", blurRadius });
  }
  return processor.switchTo({
    mode: "virtual-background",
    imagePath: presetImagePath(backgroundPreset),
  });
}
