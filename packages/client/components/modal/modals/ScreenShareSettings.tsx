import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { createFormControl, createFormGroup } from "solid-forms";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import {
  ScreenShareFrameRates,
  ScreenShareResolution,
} from "@revolt/state/stores/Voice";
import { Column, Dialog, DialogProps, Form2 } from "@revolt/ui";
import { VideoTrack } from "solid-livekit-components";

import { Show } from "solid-js";
import { Modals } from "../types";

export function ScreenShareSettingsModal(
  props: DialogProps & Modals & { type: "screen_share_settings" },
) {
  const { voice: settings } = useState();
  const voice = useVoice();
  const { t } = useLingui();

  const enabledResolutions = voice.getEnabledScreenShareResolutions();

  const group = createFormGroup({
    resolution: createFormControl<ScreenShareResolution>(
      enabledResolutions.includes(settings.screenShareResolution)
        ? settings.screenShareResolution
        : (enabledResolutions.at(-1) ?? "720p"),
      { required: true },
    ),
    frameRate: createFormControl<string>(`${settings.screenShareFrameRate}`, {
      required: true,
    }),
    textMode: createFormControl(settings.screenShareTextMode),
    audio: createFormControl(props.audio && settings.screenShareAudio, {
      disabled: !props.audio,
    }),
  });

  async function onSubmit() {
    props.callback(
      group.controls.resolution.value,
      Number(
        group.controls.frameRate.value,
      ) as (typeof ScreenShareFrameRates)[number],
      group.controls.textMode.value,
      group.controls.audio.value && props.audio,
    );
    props.onClose();
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      minWidth={420}
      show={props.show}
      onClose={() => {
        props.onCancel();
        props.onClose();
      }}
      title={t`Screen Share Settings`}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Go</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
        },
      ]}
    >
      <VideoTrack
        trackRef={props.trackReference}
        style={{
          padding: "var(--gap-md)",
          "border-radius": "var(--borderRadius-lg)",
          "max-height": "400px",
          "justify-self": "center",
        }}
      />
      <form onSubmit={submit}>
        <Column>
          <Form2.ButtonGroup
            control={group.controls.resolution}
            buttonDefinitions={enabledResolutions.map((resolution) => ({
              children: resolution,
              value: resolution,
            }))}
          />
          <Form2.ButtonGroup
            control={group.controls.frameRate}
            buttonDefinitions={ScreenShareFrameRates.map((frameRate) => ({
              children: `${frameRate} FPS`,
              value: `${frameRate}`,
            }))}
          />
          <Form2.Checkbox control={group.controls.textMode}>
            <Trans>Optimise for Text</Trans>
          </Form2.Checkbox>
          <Show when={props.audio}>
            <Form2.Checkbox control={group.controls.audio}>
              <Trans>Share audio</Trans>
            </Form2.Checkbox>
          </Show>
          <Show when={!props.audio}>
            <small>
              <Trans>Audio disabled by browser</Trans>
            </small>
          </Show>
        </Column>
      </form>
    </Dialog>
  );
}
