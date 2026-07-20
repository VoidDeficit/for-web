import { createMemo, For, Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { cameraEffectsSupported } from "@revolt/rtc/video/CameraProcessor";
import { useState } from "@revolt/state";
import { CameraBackgroundPresets } from "@revolt/state/stores/Voice";
import { Text } from "@revolt/ui";

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

const MenuLabel = styled("div", {
  base: {
    padding: "var(--gap-sm) var(--gap-lg)",
  },
});

/**
 * Right-click menu on the camera button: background blur or a virtual
 * background image, similar to Discord/Zoom's camera effects. Applies
 * live via a client-side segmentation model, no server involved.
 */
export function CameraEffectsMenu() {
  const voice = useVoice();
  const { voice: settings } = useState();

  const mode = createMemo(() => settings.cameraBackgroundMode);
  const supported = cameraEffectsSupported();

  return (
    <ContextMenu class="CameraEffectsMenu">
      <Show when={!supported}>
        <MenuLabel>
          <Text class="label">
            <Trans>Not supported by this browser</Trans>
          </Text>
        </MenuLabel>
        <ContextMenuDivider />
      </Show>
      <ContextMenuButton
        symbol={MdBlock}
        onClick={() => voice.setCameraBackground("none")}
        actionSymbol={
          mode() === "none" ? MdRadioButtonChecked : MdRadioButtonUnchecked
        }
      >
        <Trans>No Effect</Trans>
      </ContextMenuButton>

      <Show when={supported}>
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
      </Show>
    </ContextMenu>
  );
}
