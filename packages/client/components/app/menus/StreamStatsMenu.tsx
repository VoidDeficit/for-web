import { Trans } from "@lingui-solid/solid/macro";
import { createSignal, onCleanup, Show } from "solid-js";
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from "solid-livekit-components";

import { LocalVideoTrack, RemoteVideoTrack, Track } from "livekit-client";
import { styled } from "styled-system/jsx";

import { Text } from "@revolt/ui";

import { ContextMenu, ContextMenuDivider } from "./ContextMenu";

const StatRow = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    gap: "var(--gap-lg)",
    padding: "var(--gap-xs) var(--gap-lg)",
    fontSize: "0.8em",
    fontFamily: "var(--font-monospace, monospace)",

    "& span:last-child": {
      color: "var(--md-sys-color-on-surface-variant)",
    },
  },
});

type Stats = {
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  codec?: string;
  qualityLimitation?: string;
  packetsLost?: number;
  jitterMs?: number;
  roundTripMs?: number;
};

/**
 * Poll WebRTC stats for a local (outbound) or remote (inbound) video track
 * and derive an approximate fps from the frame counter delta, mirroring
 * what about:webrtc / chrome://webrtc-internals show.
 */
function pollTrackStats(
  track: LocalVideoTrack | RemoteVideoTrack,
  onUpdate: (stats: Stats) => void,
) {
  let lastFrames: number | undefined;
  let lastTimestamp: number | undefined;

  async function tick() {
    try {
      if ("getSenderStats" in track) {
        const items = await (track as LocalVideoTrack).getSenderStats();
        const primary = items[0];
        if (!primary) return;

        const frames = primary.framesSent;
        const timestamp = primary.timestamp;
        let fps = primary.framesPerSecond;
        if (
          fps === undefined &&
          frames !== undefined &&
          timestamp !== undefined &&
          lastFrames !== undefined &&
          lastTimestamp !== undefined
        ) {
          const dt = (timestamp - lastTimestamp) / 1000;
          if (dt > 0) fps = (frames - lastFrames) / dt;
        }
        lastFrames = frames;
        lastTimestamp = timestamp;

        onUpdate({
          resolution:
            primary.frameWidth && primary.frameHeight
              ? `${primary.frameWidth}x${primary.frameHeight}`
              : undefined,
          fps: fps !== undefined ? Math.round(fps) : undefined,
          bitrateKbps: primary.targetBitrate
            ? Math.round(primary.targetBitrate / 1000)
            : undefined,
          qualityLimitation: primary.qualityLimitationReason,
          packetsLost: primary.packetsLost,
          jitterMs:
            primary.jitter !== undefined
              ? Math.round(primary.jitter * 1000)
              : undefined,
          roundTripMs:
            primary.roundTripTime !== undefined
              ? Math.round(primary.roundTripTime * 1000)
              : undefined,
        });
      } else {
        const stats = await (track as RemoteVideoTrack).getReceiverStats();
        if (!stats) return;

        const frames = stats.framesReceived;
        const timestamp = stats.timestamp;
        let fps: number | undefined;
        if (
          frames !== undefined &&
          timestamp !== undefined &&
          lastFrames !== undefined &&
          lastTimestamp !== undefined
        ) {
          const dt = (timestamp - lastTimestamp) / 1000;
          if (dt > 0) fps = (frames - lastFrames) / dt;
        }
        lastFrames = frames;
        lastTimestamp = timestamp;

        onUpdate({
          resolution:
            stats.frameWidth && stats.frameHeight
              ? `${stats.frameWidth}x${stats.frameHeight}`
              : undefined,
          fps: fps !== undefined ? Math.round(fps) : undefined,
          codec: stats.mimeType,
          packetsLost: stats.packetsLost,
          jitterMs:
            stats.jitter !== undefined
              ? Math.round(stats.jitter * 1000)
              : undefined,
        });
      }
    } catch {
      // stats collection is best-effort; ignore transient getStats() failures
    }
  }

  tick();
  const interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
}

/**
 * Live WebRTC stats (fps, resolution, bitrate, codec, packet loss) for a
 * video/screenshare track, shown in its right-click context menu.
 */
export function StreamStatsMenu(props: { track: TrackReferenceOrPlaceholder }) {
  const [stats, setStats] = createSignal<Stats>({});

  const videoTrack = () => {
    if (!isTrackReference(props.track)) return undefined;
    const t = props.track.publication?.track;
    if (!t || t.kind !== Track.Kind.Video) return undefined;
    return t as LocalVideoTrack | RemoteVideoTrack;
  };

  const track = videoTrack();
  if (track) {
    const stop = pollTrackStats(track, setStats);
    onCleanup(stop);
  }

  return (
    <Show when={track}>
      <ContextMenu class="StreamStatsMenu">
        <Text
          class="label"
          style={{ padding: "var(--gap-xs) var(--gap-lg)" }}
        >
          <Trans>Stream Info</Trans>
        </Text>
        <ContextMenuDivider />
        <Show when={stats().resolution}>
          <StatRow>
            <span>
              <Trans>Resolution</Trans>
            </span>
            <span>{stats().resolution}</span>
          </StatRow>
        </Show>
        <Show when={stats().fps !== undefined}>
          <StatRow>
            <span>
              <Trans>Frame rate</Trans>
            </span>
            <span>{stats().fps} fps</span>
          </StatRow>
        </Show>
        <Show when={stats().bitrateKbps !== undefined}>
          <StatRow>
            <span>
              <Trans>Bitrate</Trans>
            </span>
            <span>{stats().bitrateKbps} kbps</span>
          </StatRow>
        </Show>
        <Show when={stats().codec}>
          <StatRow>
            <span>
              <Trans>Codec</Trans>
            </span>
            <span>{stats().codec}</span>
          </StatRow>
        </Show>
        <Show when={stats().qualityLimitation}>
          <StatRow>
            <span>
              <Trans>Limited by</Trans>
            </span>
            <span>{stats().qualityLimitation}</span>
          </StatRow>
        </Show>
        <Show when={stats().packetsLost !== undefined}>
          <StatRow>
            <span>
              <Trans>Packets lost</Trans>
            </span>
            <span>{stats().packetsLost}</span>
          </StatRow>
        </Show>
        <Show when={stats().jitterMs !== undefined}>
          <StatRow>
            <span>
              <Trans>Jitter</Trans>
            </span>
            <span>{stats().jitterMs} ms</span>
          </StatRow>
        </Show>
        <Show when={stats().roundTripMs !== undefined}>
          <StatRow>
            <span>
              <Trans>Round trip</Trans>
            </span>
            <span>{stats().roundTripMs} ms</span>
          </StatRow>
        </Show>
      </ContextMenu>
    </Show>
  );
}
