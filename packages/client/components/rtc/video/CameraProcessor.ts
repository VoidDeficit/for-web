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
 */
function assetPaths() {
  const paths: { tasksVisionFileSet?: string; modelAssetPath?: string } = {};
  if (CONFIGURATION.CAMERA_SEGMENTER_WASM_URL) {
    paths.tasksVisionFileSet = CONFIGURATION.CAMERA_SEGMENTER_WASM_URL;
  }
  if (CONFIGURATION.CAMERA_SEGMENTER_MODEL_URL) {
    paths.modelAssetPath = CONFIGURATION.CAMERA_SEGMENTER_MODEL_URL;
  }
  return paths;
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
