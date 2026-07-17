import { createMemo, For } from "solid-js";
import { useMediaDeviceSelect } from "solid-livekit-components";

import { Trans } from "@lingui-solid/solid/macro";

import { useState } from "@revolt/state";

import MdCheck from "@material-symbols/svg-400/outlined/check.svg?component-solid";

import { ContextMenu, ContextMenuButton } from "./ContextMenu";

/**
 * Quick input/output audio device switcher, shown from the mic/deafen
 * buttons' right-click menu so devices can be swapped without opening full
 * Voice Settings.
 */
export function DeviceContextMenu(props: {
  kind: "audioinput" | "audiooutput";
}) {
  const state = useState();
  const media = createMemo(() => useMediaDeviceSelect({ kind: props.kind }));

  const settingsKey = createMemo(() =>
    props.kind === "audioinput"
      ? ("preferredAudioInputDevice" as const)
      : ("preferredAudioOutputDevice" as const),
  );

  const activeId = createMemo(() => state.voice[settingsKey()] ?? "default");

  const options = createMemo(() => {
    const devices = media().devices();
    const withoutDefault = devices.filter((d) => d.deviceId !== "default");
    const defaultDevice = devices.find((d) => d.deviceId === "default");
    return [
      { deviceId: "default", label: defaultDevice?.label ?? "Default" },
      ...withoutDefault,
    ];
  });

  function select(deviceId: string) {
    const mMedia = media();
    if (
      deviceId === "default" ||
      mMedia.devices().find((d) => d.deviceId === deviceId)
    ) {
      mMedia.setActiveMediaDevice(deviceId);
      state.voice[settingsKey()] =
        deviceId === "default" ? undefined : deviceId;
    }
  }

  return (
    <ContextMenu class="DeviceContextMenu">
      <For each={options()}>
        {(device) => (
          <ContextMenuButton
            onClick={() => select(device.deviceId)}
            actionSymbol={activeId() === device.deviceId ? MdCheck : undefined}
          >
            {device.label || <Trans>Unknown device</Trans>}
          </ContextMenuButton>
        )}
      </For>
    </ContextMenu>
  );
}
