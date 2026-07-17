import {
  Accessor,
  batch,
  createContext,
  createSignal,
  JSX,
  Setter,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  useTracks,
} from "solid-livekit-components";

import type { TrackPublishOptions } from "livekit-client";
import { Room, Track, VideoEncoding, VideoResolution } from "livekit-client";
import { DenoiseTrackProcessor } from "livekit-rnnoise-processor";
import { Channel } from "stoat.js";

import { SoundController, useClient, useSound } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { ModalController, useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import {
  ScreenShareFrameRate,
  ScreenShareResolution,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { InRoom } from "./components/InRoom";
import { RoomAudioManager } from "./components/RoomAudioManager";

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

type ScreenShareQuality = {
  resolution: VideoResolution;
  contentHint: string;
  encoding: VideoEncoding;
};

const SCREEN_SHARE_DIMENSIONS: Record<
  ScreenShareResolution,
  { width: number; height: number }
> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
};

// Max bitrate (bps) ceilings for WebRTC's built-in congestion control to
// work within, not fixed targets - the actual bitrate used adapts
// dynamically based on real network/CPU conditions (see
// degradationPreference below). Screenshare content varies wildly in how
// hard it is to encode (a static desktop vs. fast-motion gameplay), so
// these lean generous, especially at higher frame rates where every pixel
// changing every frame needs much more bitrate to hold detail.
const SCREEN_SHARE_MAX_BITRATE: Record<
  ScreenShareResolution,
  Record<ScreenShareFrameRate, number>
> = {
  "480p": { 15: 1_000_000, 30: 1_500_000, 60: 2_000_000 },
  "720p": { 15: 1_500_000, 30: 3_000_000, 60: 4_500_000 },
  "1080p": { 15: 3_000_000, 30: 8_000_000, 60: 10_000_000 },
  "1440p": { 15: 5_000_000, 30: 12_000_000, 60: 16_000_000 },
};

class Voice {
  #settings: VoiceSettings;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  vidTracks: Accessor<TrackReferenceOrPlaceholder[]>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
  microphone: Accessor<boolean>;

  video: Accessor<boolean>;
  #setVideo: Setter<boolean>;

  screenshare: Accessor<boolean>;
  #setScreenshare: Setter<boolean>;

  fullscreen: Accessor<boolean>;
  #setFullscreen: Setter<boolean>;

  focusId: Accessor<string | undefined>;
  #setFocus: Setter<string | undefined>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private sound: SoundController;

  private openModal;
  private getClient;
  private screenShareTracks: Set<string>;

  constructor(
    voiceSettings: VoiceSettings,
    modals: ModalController,
    sound: SoundController,
  ) {
    this.#settings = voiceSettings;
    this.sound = sound;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    this.vidTracks = () => [];

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    this.deafen = () => voiceSettings.deafen;
    this.microphone = () => voiceSettings.micOn && !voiceSettings.deafen;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;

    const [fullscreen, setFullscreen] = createSignal(false);
    this.fullscreen = fullscreen;
    this.#setFullscreen = setFullscreen;

    const [focus, setFocus] = createSignal<string>();
    this.focusId = focus;
    this.#setFocus = setFocus;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    this.openModal = modals.openModal;

    this.getClient = useClient();

    this.screenShareTracks = new Set();
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    this.disconnect();

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression === "browser",
        autoGainControl: this.#settings.autoGainControl,
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
      videoCaptureDefaults: {
        deviceId: this.#settings.preferredVideoDevice,
      },
    });

    this.vidTracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ],
      { room, onlySubscribed: false },
    );

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    room.addListener("connected", () => {
      this.#setState("CONNECTED");
      if (this.speakingPermission)
        room.localParticipant
          .setMicrophoneEnabled(this.#settings.micOn)
          .then((track) => {
            this.#settings.micOn = track != null;
            if (this.#settings.noiseSupression === "enhanced") {
              track?.audioTrack?.setProcessor(
                new DenoiseTrackProcessor({
                  workletCDNURL: CONFIGURATION.RNNOISE_WORKLET_CDN_URL,
                }),
              );
            }
          });
      for (const p of room.remoteParticipants.values()) {
        const screenShareTrack = p.getTrackPublication(
          Track.Source.ScreenShare,
        );
        if (screenShareTrack) {
          this.screenShareTracks.add(screenShareTrack.trackSid);
        }
      }
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("disconnected", () => this.#setState("DISCONNECTED"));

    room.addListener("participantConnected", () => {
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("participantDisconnected", () => {
      this.sound.playSound("userLeaveVoice");
    });

    room.addListener("trackPublished", (pub) => {
      if (pub.source === Track.Source.ScreenShare) {
        pub.once("subscribed", (track) => {
          // Play the sound once playback starts, which might be quite a bit after subscription
          // as it starts paused for the screen share settings modal.
          track.once("videoPlaybackStarted", () => {
            this.sound.playSound("streamStart");
            if (track.sid) {
              this.screenShareTracks.add(track.sid);
            }
          });
        });
      }
    });

    room.addListener("trackUnpublished", (unpub) => {
      if (this.screenShareTracks.has(unpub.trackSid)) {
        this.sound.playSound("streamEnd");
        this.screenShareTracks.delete(unpub.trackSid);
      }
    });

    if (!auth) {
      auth = await channel.joinCall("worldwide");
    }

    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });
  }

  disconnect() {
    try {
      const room = this.room();
      if (!room) return;

      room.removeAllListeners();
      room.disconnect();

      batch(() => {
        this.#setState("READY");
        this.#setRoom();
        this.#setChannel();
        this.#setFullscreen(false);
        this.vidTracks = () => [];
      });

      this.screenShareTracks = new Set();

      this.sound.playSound("userLeaveVoice");
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleDeafen(fromMute?: boolean) {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        (this.#settings.micOn || !!fromMute) &&
          !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.deafen = !this.#settings.deafen;
      if (fromMute) {
        this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;
      }
      if (this.#settings.deafen) {
        this.sound.playSound("deafen");
      } else {
        this.sound.playSound("undeafen");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleMute() {
    if (this.#settings.deafen) {
      this.toggleDeafen(true);
      return;
    }
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;

      if (this.#settings.micOn) {
        this.sound.playSound("unmute");
      } else {
        this.sound.playSound("mute");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleCamera() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );

      this.#setVideo(room.localParticipant.isCameraEnabled);
    } catch (e) {
      this.onErr(e);
    }
  }

  /**
   * Get the screen share resolutions enabled by the server's configured
   * video_resolution limit. 480p and 720p are always enabled; 1080p/1440p
   * require the server to allow at least that resolution.
   */
  getEnabledScreenShareResolutions(): ScreenShareResolution[] {
    const enabled: ScreenShareResolution[] = ["480p", "720p"];

    const limit = this.getClient().configured()
      ? this.getClient().configuration?.features.limits.default.video_resolution
      : undefined;

    if (!limit || (limit[0] === 0 && limit[1] === 0)) {
      // No limit configured (or explicitly unlimited) - allow everything.
      return [...enabled, "1080p", "1440p"];
    }

    for (const res of ["1080p", "1440p"] as const) {
      const { width, height } = SCREEN_SHARE_DIMENSIONS[res];
      if (
        (limit[0] === 0 || limit[0] >= width) &&
        (limit[1] === 0 || limit[1] >= height)
      ) {
        enabled.push(res);
      }
    }

    return enabled;
  }

  /**
   * Build the capture/publish quality for a given resolution + frame rate,
   * clamped to whatever the server's video_resolution limit allows.
   */
  getScreenShareQuality(
    resolution: ScreenShareResolution,
    frameRate: ScreenShareFrameRate,
  ): ScreenShareQuality {
    const enabledResolutions = this.getEnabledScreenShareResolutions();
    if (!enabledResolutions.includes(resolution)) {
      resolution = enabledResolutions.at(-1) ?? "720p";
    }

    const { width, height } = SCREEN_SHARE_DIMENSIONS[resolution];

    return {
      resolution: { width, height, frameRate },
      contentHint: "motion",
      encoding: {
        maxBitrate: SCREEN_SHARE_MAX_BITRATE[resolution][frameRate],
        maxFramerate: frameRate,
      },
    };
  }

  /**
   * Build the capture/publish quality for text/document sharing: native
   * source resolution (clamped to the server limit) at a low, fixed frame
   * rate, optimised for text clarity rather than motion.
   */
  getScreenShareTextQuality(): ScreenShareQuality {
    const resolution: VideoResolution = { width: 0, height: 0, frameRate: 5 };

    const limit = this.getClient().configured()
      ? this.getClient().configuration?.features.limits.default.video_resolution
      : undefined;
    if (limit) {
      resolution.width = limit[0];
      resolution.height = limit[1];
      if (resolution.width !== 0 && resolution.height !== 0) {
        resolution.aspectRatio = resolution.width / resolution.height;
      }
    }

    return {
      resolution,
      contentHint: "text",
      encoding: { maxBitrate: 2_500_000, maxFramerate: 5 },
    };
  }

  /**
   * Get the screen share quality that should currently be used, based on
   * the user's saved settings (resolution/frame rate, or text mode).
   */
  getCurrentScreenShareQuality(): ScreenShareQuality {
    return this.#settings.screenShareTextMode
      ? this.getScreenShareTextQuality()
      : this.getScreenShareQuality(
          this.#settings.screenShareResolution,
          this.#settings.screenShareFrameRate,
        );
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";

    if (this.screenshare()) {
      await room.localParticipant.setScreenShareEnabled(false);

      this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

      this.sound.playSound("streamEnd");
    } else {
      let screenPickerIdx: number | undefined;
      let screenPickerAudio = this.#settings.screenShareAudio;

      // Register the modal on screen picker handler if it exists. This is
      // the desktop app's own source (monitor/window) picker - quality is
      // always taken from saved settings now, not chosen per-share.
      if (window.native && window.native.onceScreenPicker) {
        await new Promise<void>((resolve) => {
          window.native.onceScreenPicker((sources) => {
            this.openModal({
              type: "screen_share_picker",
              onCancel: () => {
                window.native.screenPickerCallback(-1, false);
                resolve();
              },
              callback: (idx: number, audio: boolean) => {
                window.native.screenPickerCallback(idx, audio);
                screenPickerIdx = idx;
                screenPickerAudio = audio;
                resolve();
              },
              sources: sources,
            });
          });
        });

        if (screenPickerIdx === undefined) return;
      }

      try {
        const quality = this.getCurrentScreenShareQuality();

        const publishOptions: Partial<TrackPublishOptions> = {
          // Prefer VP8 explicitly rather than relying on implicit SDK/server
          // defaults - VP8 is software-encoded on all browsers but sustains
          // frame rate far better than software H264 (OpenH264) under load.
          videoCodec: "vp8",
          // A single full-resolution layer is sufficient for screenshare and
          // avoids the encoder splitting effort across simulcast layers.
          simulcast: false,
          screenShareEncoding: quality.encoding,
          // Under CPU/bandwidth pressure, let LiveKit's own congestion
          // control step bitrate/resolution down first rather than frame
          // rate - dropping fps is exactly the throttling behaviour this
          // fix was written to avoid, so heavy content (fast-scrolling
          // builds, dense IDE redraws) should get blockier, not choppier.
          degradationPreference: "maintain-framerate",
        };

        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution: quality.resolution,
            contentHint: quality.contentHint as "motion" | "detail" | "text",
            audio: screenPickerAudio,
            // Hints Chromium (including on Linux via its PipeWire portal) to
            // offer a "share system audio" option in the picker. Firefox
            // ignores this; Linux system/tab audio capture support otherwise
            // varies by browser and desktop portal and can't be forced from
            // here - if no audio track comes back, the UI falls back to
            // showing "Audio disabled by browser".
            systemAudio: "include",
          },
          publishOptions,
        );

        // Explicitly tighten the frame rate beyond what LiveKit's typed
        // capture options allow (a bare ideal number, no floor). Firefox in
        // particular will silently throttle screen capture toward ~1fps for
        // sources it classifies as static/low-motion unless a min frame rate
        // and contentHint are both set before the track is handed off.
        if (localTrack?.videoTrack && quality.resolution.frameRate) {
          try {
            await localTrack.videoTrack.mediaStreamTrack.applyConstraints({
              frameRate: {
                min: Math.min(24, quality.resolution.frameRate),
                ideal: quality.resolution.frameRate,
                max: quality.resolution.frameRate,
              },
            });
          } catch {
            // Some capture sources (e.g. certain Wayland/PipeWire portals)
            // reject a min frameRate constraint; fall back silently since
            // contentHint alone still helps in that case.
          }
        }

        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

        if (localTrack) {
          // This event is only fired if the screen share is ended by closing the window being streamed.
          // This catches the ending and disables screen sharing on our side. If this weren't here,
          // livekit would still share stream audio after closing the window being streamed.
          localTrack.on("ended", () => {
            this.toggleScreenshare();
            const oldAudioTrack = room.localParticipant.getTrackPublication(
              Track.Source.ScreenShareAudio,
            );
            if (oldAudioTrack && oldAudioTrack.track) {
              room.localParticipant.unpublishTrack(oldAudioTrack.track);
            }
          });

          this.sound.playSound("streamStart");
        }
      } catch (e) {
        this.onErr(e);
      }
    }
  }

  /**
   * Change the resolution/frame rate of an active screen share live,
   * without stopping and restarting it. Persists the choice so future
   * shares start at this quality.
   */
  async setScreenShareQuality(
    resolution: ScreenShareResolution,
    frameRate: ScreenShareFrameRate,
  ) {
    this.#settings.screenShareResolution = resolution;
    this.#settings.screenShareFrameRate = frameRate;
    this.#settings.screenShareTextMode = false;
    await this.applyCurrentScreenShareQuality();
  }

  /**
   * Toggle text-optimised screen share mode (native resolution, capped
   * frame rate) live, without stopping and restarting the share.
   */
  async setScreenShareTextMode(enabled: boolean) {
    this.#settings.screenShareTextMode = enabled;
    await this.applyCurrentScreenShareQuality();
  }

  /**
   * Re-apply the current saved screen share quality to the active capture
   * track, if one exists. Tightens the same frameRate/width/height
   * constraints and contentHint used at capture start (see
   * toggleScreenshare), since changing publish-time encoding params like
   * maxBitrate on an already-negotiated track isn't supported by the
   * underlying WebRTC APIs - only the capture-side constraints can be
   * adjusted live.
   */
  private async applyCurrentScreenShareQuality() {
    if (!this.screenshare()) return;

    const room = this.room();
    const videoTrack = room?.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    )?.videoTrack;
    if (!videoTrack) return;

    const quality = this.getCurrentScreenShareQuality();

    await videoTrack.mediaStreamTrack.applyConstraints({
      frameRate: quality.resolution.frameRate
        ? {
            min: Math.min(24, quality.resolution.frameRate),
            ideal: quality.resolution.frameRate,
            max: quality.resolution.frameRate,
          }
        : undefined,
      width:
        quality.resolution.width === 0
          ? undefined
          : { max: quality.resolution.width },
      height:
        quality.resolution.width === 0
          ? undefined
          : { max: quality.resolution.height },
    });
    videoTrack.mediaStreamTrack.contentHint = quality.contentHint;
  }

  /**
   * Enable or disable the screen share audio track live, without stopping
   * and restarting the share.
   */
  async setScreenShareAudio(enabled: boolean) {
    this.#settings.screenShareAudio = enabled;

    const room = this.room();
    if (!room) return;

    const audioTrack = room.localParticipant.getTrackPublication(
      Track.Source.ScreenShareAudio,
    );
    if (audioTrack?.track) {
      if (enabled) {
        audioTrack.track.unmute();
      } else {
        audioTrack.track.mute();
      }
    }
  }

  toggleFullscreen(fullscreen: boolean = !this.fullscreen()) {
    this.#setFullscreen(fullscreen);
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  toggleFocus(t?: TrackReferenceOrPlaceholder) {
    const id = t ? this.trackId(t) : undefined;
    this.#setFocus(
      this.focusId() === id || this.vidTracks().length < 2 ? undefined : id,
    );
  }

  isFocus(t: TrackReferenceOrPlaceholder) {
    return this.trackId(t) === this.focusId();
  }

  focusTrack() {
    const id = this.focusId();
    return id
      ? this.vidTracks().find((t) => this.trackId(t) === id)
      : undefined;
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  showCard(channel: Channel) {
    return (
      channel.isVoice &&
      (this.channel()?.id === channel.id ||
        channel.type === "TextChannel" ||
        channel.voiceParticipants.size)
    );
  }

  get listenPermission() {
    return !!this.channel()?.havePermission("Listen");
  }

  get speakingPermission() {
    return !!this.channel()?.havePermission("Speak");
  }

  private onErr(e: unknown) {
    if ((e as Error).name !== "NotAllowedError")
      this.openModal({ type: "error2", error: e });
  }
}

const voiceContext = createContext<Voice>(null as unknown as Voice);

/**
 * Mount global voice context and room audio manager
 */
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const modals = useModals();
  const sound = useSound();
  const voice = new Voice(state.voice, modals, sound);

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <InRoom>
          <RoomAudioManager />
        </InRoom>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
