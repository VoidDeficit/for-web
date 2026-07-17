import { For } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import {
  ScreenShareFrameRates,
  ScreenShareResolution,
} from "@revolt/state/stores/Voice";

import MdCheckBox from "@material-symbols/svg-400/outlined/check_box.svg?component-solid";
import MdCheckBoxOutlineBlank from "@material-symbols/svg-400/outlined/check_box_outline_blank.svg?component-solid";
import MdRadioButtonChecked from "@material-symbols/svg-400/outlined/radio_button_checked-fill.svg?component-solid";
import MdRadioButtonUnchecked from "@material-symbols/svg-400/outlined/radio_button_unchecked.svg?component-solid";
import MdStopScreenShare from "@material-symbols/svg-400/outlined/stop_screen_share.svg?component-solid";
import MdTune from "@material-symbols/svg-400/outlined/tune.svg?component-solid";
import MdVolumeUp from "@material-symbols/svg-400/outlined/volume_up.svg?component-solid";

import {
  ContextMenu,
  ContextMenuButton,
  ContextMenuDivider,
  ContextMenuSubMenu,
} from "./ContextMenu";

/**
 * Right-click/click menu on the active screen share button: stop
 * streaming, live resolution/frame rate switching, text mode, and a
 * stream audio toggle - similar to Discord's screen share controls.
 */
export function ShareStreamMenu() {
  const voice = useVoice();
  const { voice: settings } = useState();

  const enabledResolutions = () => voice.getEnabledScreenShareResolutions();

  return (
    <ContextMenu class="ShareStreamMenu">
      <ContextMenuButton
        symbol={MdStopScreenShare}
        onClick={() => voice.toggleScreenshare()}
        destructive
      >
        <Trans>Stop Streaming</Trans>
      </ContextMenuButton>

      <ContextMenuDivider />

      <ContextMenuSubMenu
        symbol={MdTune}
        buttonContent={<Trans>Stream Quality</Trans>}
      >
        <For each={ScreenShareFrameRates}>
          {(frameRate) => (
            <ContextMenuButton
              onClick={() =>
                voice.setScreenShareQuality(
                  settings.screenShareResolution,
                  frameRate,
                )
              }
              actionSymbol={
                !settings.screenShareTextMode &&
                settings.screenShareFrameRate === frameRate
                  ? MdRadioButtonChecked
                  : MdRadioButtonUnchecked
              }
            >
              {frameRate} FPS
            </ContextMenuButton>
          )}
        </For>

        <ContextMenuDivider />

        <For each={enabledResolutions()}>
          {(resolution: ScreenShareResolution) => (
            <ContextMenuButton
              onClick={() =>
                voice.setScreenShareQuality(
                  resolution,
                  settings.screenShareFrameRate,
                )
              }
              actionSymbol={
                !settings.screenShareTextMode &&
                settings.screenShareResolution === resolution
                  ? MdRadioButtonChecked
                  : MdRadioButtonUnchecked
              }
            >
              {resolution}
            </ContextMenuButton>
          )}
        </For>

        <ContextMenuDivider />

        <ContextMenuButton
          onClick={() =>
            voice.setScreenShareTextMode(!settings.screenShareTextMode)
          }
          actionSymbol={
            settings.screenShareTextMode ? MdCheckBox : MdCheckBoxOutlineBlank
          }
        >
          <Trans>Optimise for Text</Trans>
        </ContextMenuButton>
      </ContextMenuSubMenu>

      <ContextMenuButton
        symbol={MdVolumeUp}
        onClick={() => voice.setScreenShareAudio(!settings.screenShareAudio)}
        actionSymbol={
          settings.screenShareAudio ? MdCheckBox : MdCheckBoxOutlineBlank
        }
      >
        <Trans>Share Stream Audio</Trans>
      </ContextMenuButton>
    </ContextMenu>
  );
}
