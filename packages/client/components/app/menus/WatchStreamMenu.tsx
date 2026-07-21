import { Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useVoice } from "@revolt/rtc";

import MdPlayArrow from "@material-symbols/svg-400/outlined/play_arrow.svg?component-solid";
import MdVisibilityOff from "@material-symbols/svg-400/outlined/visibility_off.svg?component-solid";

import { ContextMenu, ContextMenuButton } from "./ContextMenu";

/**
 * Right-click menu on a remote screen share tile: watch or stop watching
 * the stream, mirroring the explicit Watch Stream / Stop Watching buttons
 * shown on the tile itself.
 */
export function WatchStreamMenu(props: { trackSid: string }) {
  const voice = useVoice();

  const isWatching = () => voice.isWatchingTrack(props.trackSid);

  return (
    <ContextMenu class="WatchStreamMenu">
      <Show
        when={isWatching()}
        fallback={
          <ContextMenuButton
            symbol={MdPlayArrow}
            onClick={() => voice.watchTrackBySid(props.trackSid)}
          >
            <Trans>Watch Stream</Trans>
          </ContextMenuButton>
        }
      >
        <ContextMenuButton
          symbol={MdVisibilityOff}
          onClick={() => voice.unwatchTrackBySid(props.trackSid)}
        >
          <Trans>Stop Watching</Trans>
        </ContextMenuButton>
      </Show>
    </ContextMenu>
  );
}
