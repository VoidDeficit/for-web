import { createMemo, createSignal, For, Show } from "solid-js";
import {
  TrackReference,
  useEnsureParticipant,
  useIsMuted,
  useIsSpeaking,
  useTrackRefContext,
  VideoTrack,
} from "solid-livekit-components";

import { RemoteTrackPublication, Track } from "livekit-client";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useLingui } from "@lingui-solid/solid/macro";

import {
  StreamStatsMenu,
  UserContextMenu,
  ViewersMenu,
  WatchStreamMenu,
} from "@revolt/app";
import { useUser, useUsers } from "@revolt/markdown/users";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Avatar, IconButton } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";
import { OverflowingText } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceStatefulUserIcons } from "../VoiceStatefulUserIcons";

type TileProps = {
  focus?: boolean;
};

/**
 * Individual participant tile
 */
export function ParticipantTile(props: TileProps) {
  const voice = useVoice();
  const state = useState();
  const participant = useEnsureParticipant();
  const track = useTrackRefContext();
  const user = useUser(participant.identity);
  const { t } = useLingui();

  let videoRef: HTMLVideoElement | undefined;

  const [videoDims, setVideoDims] = createSignal<{
    height: number;
    width: number;
  }>({ height: 0, width: 0 });

  const isMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });

  const isScreenShareAudioMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShareAudio,
  });

  const isRemoteScreenShareMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShare,
  });

  // "Muted by viewer" only makes sense for other people's screen shares -
  // for your own tile, show whether you've actually got screen share
  // audio enabled (state.voice.screenShareAudio), not the per-viewer mute
  // map, which otherwise defaults to "muted" for every user id that has no
  // explicit entry yet - including your own.
  const isScreenShareAudioUserMuted = () =>
    participant.isLocal
      ? !state.voice.screenShareAudio || isScreenShareAudioMuted() || false
      : state.voice.getScreenShareMuted(user().user!.id)
        ? "by-user"
        : isScreenShareAudioMuted() || false;

  const isVideoMuted = useIsMuted({
    participant,
    source: Track.Source.Camera,
  });

  const isVideo = () => !isVideoMuted();
  const isScreenShare = () => track.source === Track.Source.ScreenShare;
  const isSpeaking = useIsSpeaking(participant);

  // Screen shares from other people don't auto-play - like Discord, you
  // have to explicitly click to watch, so people don't burn bandwidth on
  // streams they've scrolled past. Your own share is always "watched".
  const isRemoteScreenShare = () => isScreenShare() && !participant.isLocal;

  const remotePublication = () =>
    track.publication instanceof RemoteTrackPublication
      ? track.publication
      : undefined;

  const isWatching = () =>
    !isRemoteScreenShare() ||
    voice.isWatchingTrack(track.publication?.trackSid ?? "");

  const watchers = createMemo(() =>
    isScreenShare() ? voice.getWatchers(track.publication?.trackSid ?? "") : [],
  );
  const watcherUsers = useUsers(() => watchers(), true);

  const getHeight = () => {
    if (!props.focus || videoDims().height == 0) return {};
    // Calculate the aspect ratio
    const ratio = videoDims().width / videoDims().height;

    return ratio > 1
      ? { height: `min(var(--vc-w) / ${ratio}, 100%)` }
      : { height: "100%" };
  };

  return (
    <Show when={!isScreenShare() || !isRemoteScreenShareMuted()}>
      <div
        class={
          tile({
            speaking: !isScreenShare() && isSpeaking(),
            video: isVideo() || isScreenShare(),
            fullscreen: voice.fullscreen(),
            ...props,
          }) + (isScreenShare() ? " vc_tile group" : " vc_tile")
        }
        onClick={() => {
          if (isRemoteScreenShare() && !isWatching()) {
            const pub = remotePublication();
            if (pub) voice.watchTrack(pub);
            return;
          }
          voice.toggleFocus(track);
        }}
        use:floating={{
          // TODO: Conflicts with focusing, maybe only show if clicking name itself
          //   userCard: {
          //     user: user().user!,
          //     member: user().member,
          //   },
          contextMenu: () => (
            <>
              <Show when={isRemoteScreenShare() && track.publication?.trackSid}>
                <WatchStreamMenu trackSid={track.publication!.trackSid} />
              </Show>
              <StreamStatsMenu track={track} />
              <UserContextMenu
                user={user().user!}
                member={user().member}
                inVoice={!isScreenShare()}
                isScreenshare={isScreenShare()}
              />
            </>
          ),
        }}
        style={{ ...getHeight() }}
      >
        <Show
          when={(isVideo() || isScreenShare()) && isWatching()}
          fallback={
            <>
              <AvatarOnly>
                <Avatar
                  src={user().avatar}
                  fallback={user().username}
                  size={48}
                  interactive={false}
                />
              </AvatarOnly>
              <Show when={isRemoteScreenShare() && !isWatching()}>
                <WatchButtonHolder onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    size="lg"
                    variant="filled"
                    onPress={() => {
                      const pub = remotePublication();
                      if (pub) voice.watchTrack(pub);
                    }}
                    use:floating={{
                      tooltip: {
                        placement: "top",
                        content: t`Watch Stream`,
                      },
                    }}
                  >
                    <Symbol>play_arrow</Symbol>
                  </IconButton>
                </WatchButtonHolder>
              </Show>
            </>
          }
        >
          <VideoTrack
            style={{
              "grid-area": "1/1",
              "object-fit": "contain",
              width: "100%",
              height: "100%",
              overflow: "hidden",
            }}
            trackRef={track as TrackReference}
            manageSubscription={!isRemoteScreenShare()}
            ref={videoRef}
            on:resize={() => {
              setVideoDims({
                height: videoRef?.videoHeight || 0,
                width: videoRef?.videoWidth || 0,
              });
            }}
          />
        </Show>
        <Overlay showOnHover={isScreenShare()}>
          <OverlayInner>
            <OverflowingText>{user().username}</OverflowingText>
            <Row gap="md">
              <Show when={isScreenShare()}>
                <Show when={watcherUsers().length}>
                  <ViewerList
                    onClick={(e) => e.stopPropagation()}
                    use:floating={{
                      contextMenu: () => <ViewersMenu userIds={watchers()} />,
                      contextMenuHandler: "click",
                    }}
                  >
                    <For each={watcherUsers().slice(0, 5)}>
                      {(watcher) => (
                        <ViewerAvatar>
                          <Avatar
                            src={watcher?.avatar}
                            fallback={watcher?.username ?? "?"}
                            size={20}
                            interactive={false}
                          />
                        </ViewerAvatar>
                      )}
                    </For>
                    <Show when={watcherUsers().length > 5}>
                      <OverflowingText>
                        +{watcherUsers().length - 5}
                      </OverflowingText>
                    </Show>
                  </ViewerList>
                </Show>
              </Show>
              {isScreenShare() ? (
                <Show when={isScreenShareAudioUserMuted()}>
                  <Symbol
                    size={18}
                    color={
                      isScreenShareAudioUserMuted() === "by-user"
                        ? "var(--md-sys-color-error)"
                        : undefined
                    }
                  >
                    no_sound
                  </Symbol>
                </Show>
              ) : (
                <VoiceStatefulUserIcons
                  userId={participant.identity}
                  muted={isMuted()}
                  camera={isVideo()}
                />
              )}
              <Show when={isRemoteScreenShare() && isWatching()}>
                <div onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    size="xs"
                    variant="standard"
                    onPress={() => {
                      const pub = remotePublication();
                      if (pub) voice.unwatchTrack(pub);
                    }}
                    use:floating={{
                      tooltip: {
                        placement: "top",
                        content: t`Stop Watching`,
                      },
                    }}
                  >
                    <Symbol size={18}>close_fullscreen</Symbol>
                  </IconButton>
                </div>
              </Show>
            </Row>
          </OverlayInner>
        </Overlay>
      </div>
    </Show>
  );
}

export const tile = cva({
  base: {
    display: "grid",
    aspectRatio: "16/9",
    transition: "all .3s ease, width 0s, height 0s",
    borderRadius: "var(--borderRadius-lg)",
    width: "var(--vc-tile-width)",
    maxWidth: "calc(var(--vc-h) * 16 / 9)",
    cursor: "pointer",

    color: "var(--md-sys-color-on-surface)",
    background: "#0002",

    overflow: "hidden",
    outlineWidth: "3px",
    outlineStyle: "solid",
    outlineOffset: "-3px",
    outlineColor: "transparent",
  },
  variants: {
    speaking: {
      true: {
        outlineColor: "var(--md-sys-color-primary)",
      },
    },
    focus: {
      true: {
        width: "auto",
        maxWidth: "none",
      },
    },
    video: {
      true: {},
    },
    fullscreen: {
      true: {
        minWidth: "20%",
      },
    },
  },
  compoundVariants: [
    {
      video: [false],
      focus: [true],
      css: {
        height: "100%",
        maxHeight: "calc(var(--vc-w) * 9 / 16)",
      },
    },
    {
      video: [true],
      focus: [true],
      css: {
        aspectRatio: "auto",
      },
    },
  ],
});

const AvatarOnly = styled("div", {
  base: {
    gridArea: "1/1",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",

    // TODO: Refactor the avatar component to be reactive later.
    "& > *": {
      width: "auto !important",
      height: "30% !important",
      minHeight: "48px",
    },
  },
});

const WatchButtonHolder = styled("div", {
  base: {
    gridArea: "1/1",
    display: "grid",
    placeItems: "center",
  },
});

const ViewerList = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    cursor: "pointer",
  },
});

const ViewerAvatar = styled("div", {
  base: {
    marginInlineStart: "calc(var(--gap-sm) * -1)",
    borderRadius: "var(--borderRadius-full)",
    outline: "2px solid var(--md-sys-color-surface-container)",

    _firstOfType: {
      marginInlineStart: 0,
    },
  },
});

const Overlay = styled("div", {
  base: {
    minWidth: 0,
    gridArea: "1/1",

    padding: "var(--gap-md) var(--gap-lg)",

    opacity: 1,
    display: "flex",
    alignItems: "end",
    flexDirection: "row",

    transition: "var(--transitions-fast) all",
    transitionTimingFunction: "ease",
  },
  variants: {
    showOnHover: {
      true: {
        opacity: 0,

        _groupHover: {
          opacity: 1,
        },
      },
      false: {
        opacity: 1,
      },
    },
  },
  defaultVariants: {
    showOnHover: false,
  },
});

const OverlayInner = styled("div", {
  base: {
    minWidth: 0,

    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",

    _first: {
      flexGrow: 1,
    },
  },
});
