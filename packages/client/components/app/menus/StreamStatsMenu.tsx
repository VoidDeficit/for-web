import { Trans } from "@lingui-solid/solid/macro";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from "solid-livekit-components";

import {
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Track,
} from "livekit-client";
import { styled } from "styled-system/jsx";

import { Text } from "@revolt/ui";

import { ContextMenu, ContextMenuDivider } from "./ContextMenu";

const MenuLabel = styled("div", {
  base: {
    padding: "var(--gap-xs) var(--gap-lg)",
  },
});

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

type VideoStats = {
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  codec?: string;
  qualityLimitation?: string;
  packetsLost?: number;
  jitterMs?: number;
  roundTripMs?: number;
};

type AudioStats = {
  bitrateKbps?: number;
  packetsLost?: number;
  jitterMs?: number;
  roundTripMs?: number;
  /** Number of times the jitter buffer had to synthesise audio to mask lost/late packets - a good proxy for audible crackling/dropouts. */
  concealmentEvents?: number;
};

/**
 * Poll WebRTC stats for a local (outbound) or remote (inbound) video track
 * and derive an approximate fps from the frame counter delta, mirroring
 * what about:webrtc / chrome://webrtc-internals show.
 */
function pollVideoTrackStats(
  track: LocalVideoTrack | RemoteVideoTrack,
  onUpdate: (stats: VideoStats) => void,
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
 * Poll WebRTC stats for a local (outbound) or remote (inbound) audio track.
 * Audio sender/receiver stats don't expose codec or a ready-made bitrate
 * like video does, so bitrate is derived from the bytes-sent/received
 * counter delta, mirroring the fps-from-frame-delta approach above.
 */
function pollAudioTrackStats(
  track: LocalAudioTrack | RemoteAudioTrack,
  onUpdate: (stats: AudioStats) => void,
) {
  let lastBytes: number | undefined;
  let lastTimestamp: number | undefined;

  async function tick() {
    try {
      if ("getSenderStats" in track) {
        const primary = await (track as LocalAudioTrack).getSenderStats();
        if (!primary) return;

        const bytes = primary.bytesSent;
        const timestamp = primary.timestamp;
        let bitrateKbps: number | undefined;
        if (
          bytes !== undefined &&
          timestamp !== undefined &&
          lastBytes !== undefined &&
          lastTimestamp !== undefined
        ) {
          const dt = (timestamp - lastTimestamp) / 1000;
          if (dt > 0) bitrateKbps = ((bytes - lastBytes) * 8) / dt / 1000;
        }
        lastBytes = bytes;
        lastTimestamp = timestamp;

        onUpdate({
          bitrateKbps:
            bitrateKbps !== undefined ? Math.round(bitrateKbps) : undefined,
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
        const stats = await (track as RemoteAudioTrack).getReceiverStats();
        if (!stats) return;

        const bytes = stats.bytesReceived;
        const timestamp = stats.timestamp;
        let bitrateKbps: number | undefined;
        if (
          bytes !== undefined &&
          timestamp !== undefined &&
          lastBytes !== undefined &&
          lastTimestamp !== undefined
        ) {
          const dt = (timestamp - lastTimestamp) / 1000;
          if (dt > 0) bitrateKbps = ((bytes - lastBytes) * 8) / dt / 1000;
        }
        lastBytes = bytes;
        lastTimestamp = timestamp;

        onUpdate({
          bitrateKbps:
            bitrateKbps !== undefined ? Math.round(bitrateKbps) : undefined,
          packetsLost: stats.packetsLost,
          jitterMs:
            stats.jitter !== undefined
              ? Math.round(stats.jitter * 1000)
              : undefined,
          concealmentEvents: stats.concealmentEvents,
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
 * video/screenshare track and its associated audio track (screen share
 * audio, or microphone for camera tiles), shown in the right-click context
 * menu.
 */
export function StreamStatsMenu(props: { track: TrackReferenceOrPlaceholder }) {
  const [videoStats, setVideoStats] = createSignal<VideoStats>({});
  const [audioStats, setAudioStats] = createSignal<AudioStats>({});

  const videoTrack = () => {
    if (!isTrackReference(props.track)) return undefined;
    const t = props.track.publication?.track;
    if (!t || t.kind !== Track.Kind.Video) return undefined;
    return t as LocalVideoTrack | RemoteVideoTrack;
  };

  const audioSource = () =>
    props.track.source === Track.Source.ScreenShare
      ? Track.Source.ScreenShareAudio
      : Track.Source.Microphone;

  const audioTrack = () => {
    const t = props.track.participant.getTrackPublication(audioSource())?.track;
    if (!t || t.kind !== Track.Kind.Audio) return undefined;
    return t as LocalAudioTrack | RemoteAudioTrack;
  };

  createEffect(() => {
    const track = videoTrack();
    if (!track) return;
    const stop = pollVideoTrackStats(track, setVideoStats);
    onCleanup(stop);
  });

  createEffect(() => {
    const track = audioTrack();
    if (!track) {
      setAudioStats({});
      return;
    }
    const stop = pollAudioTrackStats(track, setAudioStats);
    onCleanup(stop);
  });

  return (
    <Show when={videoTrack() || audioTrack()}>
      <ContextMenu class="StreamStatsMenu">
        <MenuLabel>
          <Text class="label">
            <Trans>Stream Info</Trans>
          </Text>
        </MenuLabel>
        <ContextMenuDivider />
        <Show when={videoTrack()}>
          <Show when={videoStats().resolution}>
            <StatRow>
              <span>
                <Trans>Resolution</Trans>
              </span>
              <span>{videoStats().resolution}</span>
            </StatRow>
          </Show>
          <Show when={videoStats().fps !== undefined}>
            <StatRow>
              <span>
                <Trans>Frame rate</Trans>
              </span>
              <span>{videoStats().fps} fps</span>
            </StatRow>
          </Show>
          <Show when={videoStats().bitrateKbps !== undefined}>
            <StatRow>
              <span>
                <Trans>Bitrate</Trans>
              </span>
              <span>{videoStats().bitrateKbps} kbps</span>
            </StatRow>
          </Show>
          <Show when={videoStats().codec}>
            <StatRow>
              <span>
                <Trans>Codec</Trans>
              </span>
              <span>{videoStats().codec}</span>
            </StatRow>
          </Show>
          <Show when={videoStats().qualityLimitation}>
            <StatRow>
              <span>
                <Trans>Limited by</Trans>
              </span>
              <span>{videoStats().qualityLimitation}</span>
            </StatRow>
          </Show>
          <Show when={videoStats().packetsLost !== undefined}>
            <StatRow>
              <span>
                <Trans>Packets lost</Trans>
              </span>
              <span>{videoStats().packetsLost}</span>
            </StatRow>
          </Show>
          <Show when={videoStats().jitterMs !== undefined}>
            <StatRow>
              <span>
                <Trans>Jitter</Trans>
              </span>
              <span>{videoStats().jitterMs} ms</span>
            </StatRow>
          </Show>
          <Show when={videoStats().roundTripMs !== undefined}>
            <StatRow>
              <span>
                <Trans>Round trip</Trans>
              </span>
              <span>{videoStats().roundTripMs} ms</span>
            </StatRow>
          </Show>
        </Show>
        <Show when={videoTrack() && audioTrack()}>
          <ContextMenuDivider />
        </Show>
        <Show when={audioTrack()}>
          <MenuLabel>
            <Text class="label">
              <Trans>Audio</Trans>
            </Text>
          </MenuLabel>
          <Show when={audioStats().bitrateKbps !== undefined}>
            <StatRow>
              <span>
                <Trans>Bitrate</Trans>
              </span>
              <span>{audioStats().bitrateKbps} kbps</span>
            </StatRow>
          </Show>
          <Show when={audioStats().packetsLost !== undefined}>
            <StatRow>
              <span>
                <Trans>Packets lost</Trans>
              </span>
              <span>{audioStats().packetsLost}</span>
            </StatRow>
          </Show>
          <Show when={audioStats().jitterMs !== undefined}>
            <StatRow>
              <span>
                <Trans>Jitter</Trans>
              </span>
              <span>{audioStats().jitterMs} ms</span>
            </StatRow>
          </Show>
          <Show when={audioStats().roundTripMs !== undefined}>
            <StatRow>
              <span>
                <Trans>Round trip</Trans>
              </span>
              <span>{audioStats().roundTripMs} ms</span>
            </StatRow>
          </Show>
          <Show when={audioStats().concealmentEvents !== undefined}>
            <StatRow>
              <span>
                <Trans>Dropouts</Trans>
              </span>
              <span>{audioStats().concealmentEvents}</span>
            </StatRow>
          </Show>
        </Show>
      </ContextMenu>
    </Show>
  );
}
