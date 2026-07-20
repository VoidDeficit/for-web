import { createMemo, Show } from "solid-js";
import { useMediaDeviceSelect } from "solid-livekit-components";

import { Trans } from "@lingui-solid/solid/macro";

import { CONFIGURATION } from "@revolt/common";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import {
  CategoryButton,
  CategorySelectOption,
  Checkbox,
  Column,
  Slider,
  Text,
} from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Input options
 */
export function VoiceInputOptions() {
  return (
    <Column>
      <CategoryButton.Group>
        <SelectInput kind="audioinput" />
        <SelectInput kind="audiooutput" />
        <Show when={CONFIGURATION.ENABLE_VIDEO}>
          <SelectInput kind="videoinput" />
        </Show>
      </CategoryButton.Group>
      <VolumeSliders />
    </Column>
  );
}

/**
 * Select input device w/ type
 */
function SelectInput(props: { kind: MediaDeviceKind }) {
  const state = useState();
  const media = createMemo(() => useMediaDeviceSelect({ kind: props.kind }));

  const setKey = () =>
    props.kind === "videoinput"
      ? "preferredVideoDevice"
      : props.kind === "audioinput"
        ? "preferredAudioInputDevice"
        : "preferredAudioOutputDevice";

  const icon = () =>
    props.kind === "videoinput" ? (
      <Symbol>camera_video</Symbol>
    ) : props.kind === "audioinput" ? (
      <Symbol>mic</Symbol>
    ) : (
      <Symbol>speaker</Symbol>
    );

  const title = () =>
    props.kind === "videoinput" ? (
      <Trans>Select video input</Trans>
    ) : props.kind === "audioinput" ? (
      <Trans>Select audio input</Trans>
    ) : (
      <Trans>Select audio output</Trans>
    );

  const activeId = createMemo(() => state.voice[setKey()] ?? "default");

  const devOpts = createMemo(() => {
    const devs = media().devices(),
      opts: { [k in string]: CategorySelectOption } = {};

    //Ensure default is at top
    let d = devs.find((d) => d.deviceId === "default");
    opts.default = { title: d?.label ?? "Default" };

    for (d of devs)
      if (d.deviceId !== "default") opts[d.deviceId] = { title: d.label };
    return opts;
  });

  return (
    <CategoryButton.Select
      icon={icon()}
      title={title()}
      value={activeId()}
      options={devOpts()}
      onUpdate={(id) => {
        const mMedia = media();
        if (
          id === "default" ||
          mMedia.devices().find((d) => d.deviceId === id)
        ) {
          //Can't setActiveMediaDevice to "default" for video, only audio
          //But it can be applied on livekit init, so this choice will be remembered
          if (props.kind !== "videoinput" || id !== "default")
            mMedia.setActiveMediaDevice(id);
          state.voice[setKey()] = id === "default" ? undefined : id;
        }
      }}
    />
  );
}

/**
 * Select volume, and configure noise gate / target-volume AGC
 */
function VolumeSliders() {
  const state = useState();
  const voice = useVoice();

  return (
    <Column>
      <Text class="label">
        <Trans>Input Volume</Trans>
      </Text>
      <Slider
        min={0}
        max={3}
        step={0.1}
        value={state.voice.inputVolume}
        onInput={(event) => {
          state.voice.inputVolume = event.currentTarget.value;
          voice.updateMicProcessing();
        }}
        labelFormatter={(label) => (label * 100).toFixed(0) + "%"}
      />

      <Text class="label">
        <Trans>Output Volume</Trans>
      </Text>
      <Slider
        min={0}
        max={3}
        step={0.1}
        value={state.voice.outputVolume}
        onInput={(event) =>
          (state.voice.outputVolume = event.currentTarget.value)
        }
        labelFormatter={(label) => (label * 100).toFixed(0) + "%"}
      />

      <CategoryButton
        icon="blank"
        action={<Checkbox checked={state.voice.micGateEnabled} />}
        onClick={() => {
          state.voice.micGateEnabled = !state.voice.micGateEnabled;
          voice.updateMicProcessing();
        }}
      >
        <Trans>Noise Gate</Trans>
      </CategoryButton>
      <Show when={state.voice.micGateEnabled}>
        <Text class="label">
          <Trans>Gate Threshold</Trans>
        </Text>
        <Slider
          min={-60}
          max={0}
          step={1}
          value={state.voice.micGateThresholdDb}
          onInput={(event) => {
            state.voice.micGateThresholdDb = event.currentTarget.value;
            voice.updateMicProcessing();
          }}
          labelFormatter={(label) => `${label} dB`}
        />
      </Show>

      <CategoryButton
        icon="blank"
        action={<Checkbox checked={state.voice.micAgcEnabled} />}
        onClick={() => {
          state.voice.micAgcEnabled = !state.voice.micAgcEnabled;
          voice.updateMicProcessing();
        }}
      >
        <Trans>Target Volume</Trans>
      </CategoryButton>
      <Show when={state.voice.micAgcEnabled}>
        <Text class="label">
          <Trans>Target Level</Trans>
        </Text>
        <Slider
          min={-30}
          max={-6}
          step={1}
          value={state.voice.micAgcTargetDb}
          onInput={(event) => {
            state.voice.micAgcTargetDb = event.currentTarget.value;
            voice.updateMicProcessing();
          }}
          labelFormatter={(label) => `${label} dB`}
        />
      </Show>
    </Column>
  );
}
