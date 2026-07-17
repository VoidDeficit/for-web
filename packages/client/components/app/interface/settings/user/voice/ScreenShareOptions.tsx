import { Trans } from "@lingui-solid/solid/macro";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import {
  ScreenShareFrameRate,
  ScreenShareResolution,
} from "@revolt/state/stores/Voice";
import {
  CategoryButton,
  CategorySelectOption,
  Checkbox,
  Column,
  Text,
} from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

export function ScreenShareOptions() {
  const { voice } = useState();
  const voiceContext = useVoice();

  const enabledResolutions = () =>
    voiceContext.getEnabledScreenShareResolutions();

  return (
    <Column>
      <Text class="title">
        <Trans>Screen Share Settings</Trans>
      </Text>
      <CategoryButton.Group>
        <CategoryButton.Select
          icon={<Symbol>aspect_ratio</Symbol>}
          title={<Trans>Resolution</Trans>}
          options={
            Object.fromEntries(
              enabledResolutions().map((resolution) => [
                resolution,
                { title: resolution },
              ]),
            ) as { [key in ScreenShareResolution]: CategorySelectOption }
          }
          value={voice.screenShareResolution}
          onUpdate={(resolution) => (voice.screenShareResolution = resolution)}
        />
        <CategoryButton.Select<"15" | "30" | "60">
          icon={<Symbol>speed</Symbol>}
          title={<Trans>Frame Rate</Trans>}
          options={{
            "15": { title: "15 FPS" },
            "30": { title: "30 FPS" },
            "60": { title: "60 FPS" },
          }}
          value={`${voice.screenShareFrameRate}`}
          onUpdate={(frameRate) =>
            (voice.screenShareFrameRate = Number(
              frameRate,
            ) as ScreenShareFrameRate)
          }
        />
        <CategoryButton
          icon="blank"
          action={<Checkbox checked={voice.screenShareTextMode} />}
          onClick={() =>
            (voice.screenShareTextMode = !voice.screenShareTextMode)
          }
        >
          <Trans>Optimise for Text</Trans>
        </CategoryButton>
      </CategoryButton.Group>
    </Column>
  );
}
