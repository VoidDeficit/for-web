import { createMemo, For } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { CameraBackgroundPresets } from "@revolt/state/stores/Voice";

import MdBlock from "@material-symbols/svg-400/outlined/block.svg?component-solid";
import MdBlurOn from "@material-symbols/svg-400/outlined/blur_on.svg?component-solid";
import MdRadioButtonChecked from "@material-symbols/svg-400/outlined/radio_button_checked-fill.svg?component-solid";
import MdRadioButtonUnchecked from "@material-symbols/svg-400/outlined/radio_button_unchecked.svg?component-solid";
import MdWallpaper from "@material-symbols/svg-400/outlined/wallpaper.svg?component-solid";

import {
  ContextMenu,
  ContextMenuButton,
  ContextMenuDivider,
} from "./ContextMenu";

const PRESET_LABELS: Record<(typeof CameraBackgroundPresets)[number], string> =
  {
    purple: "Purple",
    blue: "Blue",
    forest: "Forest",
  };

/**
 * Right-click menu on the camera button: background blur or a virtual
 * background image, similar to Discord/Zoom's camera effects. Applies
 * live via a client-side segmentation model, no server involved.
 */
export function CameraEffectsMenu() {
  const voice = useVoice();
  const { voice: settings } = useState();

  const mode = createMemo(() => settings.cameraBackgroundMode);

  return (
    <ContextMenu class="CameraEffectsMenu">
      <ContextMenuButton
        symbol={MdBlock}
        onClick={() => voice.setCameraBackground("none")}
        actionSymbol={
          mode() === "none" ? MdRadioButtonChecked : MdRadioButtonUnchecked
        }
      >
        <Trans>No Effect</Trans>
      </ContextMenuButton>

      <ContextMenuButton
        symbol={MdBlurOn}
        onClick={() => voice.setCameraBackground("blur")}
        actionSymbol={
          mode() === "blur" ? MdRadioButtonChecked : MdRadioButtonUnchecked
        }
      >
        <Trans>Blur Background</Trans>
      </ContextMenuButton>

      <ContextMenuDivider />

      <For each={CameraBackgroundPresets}>
        {(preset) => (
          <ContextMenuButton
            symbol={MdWallpaper}
            onClick={() => voice.setCameraBackground("image", { preset })}
            actionSymbol={
              mode() === "image" && settings.cameraBackgroundPreset === preset
                ? MdRadioButtonChecked
                : MdRadioButtonUnchecked
            }
          >
            {PRESET_LABELS[preset]}
          </ContextMenuButton>
        )}
      </For>
    </ContextMenu>
  );
}
