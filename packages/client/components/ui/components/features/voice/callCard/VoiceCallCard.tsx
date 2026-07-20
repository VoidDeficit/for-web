import type { JSX } from "solid-js";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
} from "solid-js";
import { Portal } from "solid-js/web";

import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";

import { VoiceCallCardActiveRoom } from "./VoiceCallCardActiveRoom";
import { VoiceCallCardPiP } from "./VoiceCallCardPiP";
import { VoiceCallCardPreview } from "./VoiceCallCardPreview";

type FloatType = "tl" | "tr" | "bl" | "br";

const PAD = 16,
  PAD_X = `${PAD}px`,
  PAD_Y = `${PAD + 56}px`;

// Which channel's docked call card is currently mounted (i.e. which voice
// channel the user is actively looking at), if any. Used to decide
// whether the floating PiP should show instead - only one of the two is
// ever visible for a given call.
const dockedChannelContext = createContext<(id?: string) => void>();

/**
 * Floating picture-in-picture call card, shown while connected to a call
 * but not currently looking at that call's channel. Draggable to any
 * corner of the screen.
 */
export function VoiceCallCardContext(props: { children: JSX.Element }) {
  const voice = useVoice();

  const [dockedChannelId, setDockedChannelId] = createSignal<string>();
  const [float, setFloat] = createSignal<FloatType>("tr");
  const [moving, setMoving] = createSignal(false);

  let ref: HTMLDivElement | undefined,
    events: AbortController | null,
    pid = 0,
    ofsX = 0,
    ofsY = 0;

  // Only show the PiP when connected to a call whose channel isn't the one
  // currently docked/visible inline (the docked card handles that case).
  const showPiP = () => {
    const channel = voice.channel();
    return !!channel && channel.id !== dockedChannelId();
  };

  function mouseDown(e: PointerEvent) {
    pid = e.pointerId;
    const pos = ref!.getBoundingClientRect();
    ofsX = e.clientX - pos.x;
    ofsY = e.clientY - pos.y;
    setMoving(true);
    addEvents();
  }

  function mouseMove(e: PointerEvent) {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    const x = e.clientX - ofsX,
      y = e.clientY - ofsY;
    ref!.style.transform = `translate(${x}px, ${y}px)`;
  }

  function mouseUp(e: PointerEvent) {
    if (e.pointerId !== pid) return;
    const sty = ref!.style,
      pos = ref!.getBoundingClientRect(),
      left = e.clientX - ofsX + pos.width / 2 < innerWidth / 2,
      top = e.clientY - ofsY + pos.height / 2 < innerHeight / 2;

    sty.transition = "all .2s cubic-bezier(0, 1.5, 0.85, 0.8)";
    setFloat(left ? (top ? "tl" : "bl") : top ? "tr" : "br");
    //Reset CSS transition on next render pass
    setTimeout(() => (sty.transition = ""), 1);
    setMoving(false);
    resetEvents();
  }

  function addEvents() {
    if (events) return;
    events = new AbortController();
    const opt = { passive: false, signal: events.signal };
    document.addEventListener("pointermove", mouseMove, opt);
    document.addEventListener("pointerup", mouseUp, opt);
  }

  function resetEvents() {
    events?.abort();
    events = null;
  }

  createEffect(() => {
    if (!ref) return;
    const f = float();
    const sty = ref.style,
      x = f[1] === "l" ? PAD_X : `calc(100vw - var(--flt-w) - ${PAD_X})`,
      y = f[0] === "t" ? PAD_Y : `calc(100vh - var(--flt-h) - ${PAD_Y})`;
    sty.transform = `translate(${x}, ${y})`;
  });

  onCleanup(resetEvents);

  return (
    <dockedChannelContext.Provider value={setDockedChannelId}>
      {props.children}
      <Show when={showPiP()}>
        <Portal ref={document.getElementById("floating")! as HTMLDivElement}>
          <Float ref={ref} moving={moving()} onPointerDown={mouseDown}>
            <VoiceCallCardPiP />
          </Float>
        </Portal>
      </Show>
    </dockedChannelContext.Provider>
  );
}

const Float = styled("div", {
  base: {
    position: "fixed",
    zIndex: 10,
    pointerEvents: "all",
    transition: "all .3s cubic-bezier(1, 0, 0, 1)",
    touchAction: "none",
    cursor: "grab",

    "--flt-w": "300px",
    "--flt-h": "170px",
    width: "var(--flt-w)",
    height: "var(--flt-h)",
  },
  variants: {
    moving: {
      true: {
        cursor: "grabbing",
        transition: "none",
      },
    },
  },
});

/**
 * Docked call card, rendered inline in the channel view's normal document
 * flow (not an overlay) so it doesn't cover the message list. Shows a
 * small click-to-join preview when not connected, or the full call view
 * with a drag-to-resize handle when actively in this channel's call.
 */
export function DockedVoiceCallCard(props: { channel: Channel }) {
  const voice = useVoice();
  const state = useState();
  const setDockedChannelId = useContext(dockedChannelContext);

  const inCall = () => voice.channel()?.id === props.channel.id;

  onMount(() => setDockedChannelId?.(props.channel.id));
  onCleanup(() => setDockedChannelId?.(undefined));

  let viewRef: HTMLDivElement | undefined;

  onMount(() => {
    viewRef?.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        voice.toggleFullscreen(false);
      }
    });
  });

  createEffect(() => {
    if (voice.fullscreen() && inCall()) {
      if (!viewRef?.isSameNode(document.fullscreenElement)) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        viewRef?.requestFullscreen();
      }
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  });

  // The Fullscreen API only allows elements *inside* the fullscreened
  // element (and its descendants) to render on top of everything else.
  // Context menus, tooltips, etc. all portal into a single app-wide
  // #floating element mounted as a sibling of #root - normally fine, but
  // invisible while this card is fullscreened since #floating is outside
  // its subtree. Move #floating inside the fullscreened element for the
  // duration, then restore it to its original position on exit.
  onMount(() => {
    const floatingEl = document.getElementById("floating");
    const originalParent = floatingEl?.parentElement;
    const originalNextSibling = floatingEl?.nextSibling ?? null;

    function onFullscreenChange() {
      if (!floatingEl) return;
      if (document.fullscreenElement === viewRef) {
        viewRef?.appendChild(floatingEl);
      } else if (floatingEl.parentElement === viewRef) {
        originalParent?.insertBefore(floatingEl, originalNextSibling);
      }
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onCleanup(() => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      // If this card unmounts while still holding #floating (e.g. voice
      // disconnects while fullscreened), make sure it isn't left detached.
      if (floatingEl && floatingEl.parentElement === viewRef) {
        originalParent?.insertBefore(floatingEl, originalNextSibling);
      }
    });
  });

  // Drag-to-resize handle
  let resizePid = 0;
  let resizeStartY = 0;
  let resizeStartHeightVh = 0;
  let resizeEvents: AbortController | null = null;

  function resizeDown(e: PointerEvent) {
    if (voice.fullscreen()) return;
    resizePid = e.pointerId;
    resizeStartY = e.clientY;
    resizeStartHeightVh = state.voice.callCardHeightVh;
    resizeEvents = new AbortController();
    const opt = { passive: false, signal: resizeEvents.signal };
    document.addEventListener("pointermove", resizeMove, opt);
    document.addEventListener("pointerup", resizeUp, opt);
  }

  function resizeMove(e: PointerEvent) {
    if (e.pointerId !== resizePid) return;
    e.preventDefault();
    const deltaVh = ((e.clientY - resizeStartY) / window.innerHeight) * 100;
    state.voice.callCardHeightVh = resizeStartHeightVh + deltaVh;
  }

  function resizeUp(e: PointerEvent) {
    if (e.pointerId !== resizePid) return;
    resizeEvents?.abort();
    resizeEvents = null;
  }

  onCleanup(() => resizeEvents?.abort());

  return (
    <Show when={voice.showCard(props.channel)}>
      <Base>
        <Card
          ref={viewRef}
          active={inCall()}
          fullscreen={voice.fullscreen()}
          style={{
            "--call-card-height": `${state.voice.callCardHeightVh}vh`,
          }}
        >
          <Show
            when={inCall()}
            fallback={<VoiceCallCardPreview channel={props.channel} />}
          >
            <VoiceCallCardActiveRoom />
          </Show>
        </Card>
        <Show when={inCall() && !voice.fullscreen()}>
          <ResizeHandle onPointerDown={resizeDown} />
        </Show>
      </Base>
    </Show>
  );
}

const Base = styled("div", {
  base: {
    width: "100%",
    padding: "var(--gap-md)",
    paddingBottom: 0,

    userSelect: "none",

    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    flexShrink: 0,
  },
});

const Card = styled("div", {
  base: {
    pointerEvents: "all",
    width: "100%",

    transition: "var(--transitions-fast) background, border-radius",
    transitionTimingFunction: "ease-in-out",

    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-secondary-container)",
  },
  variants: {
    active: {
      true: {
        height: "var(--call-card-height, 40vh)",
        // Guard against the message list being squeezed to nothing on a
        // short viewport - always leave room for at least a sliver of
        // chat below, regardless of the persisted/dragged height.
        maxHeight: "calc(100vh - 220px)",
      },
      false: {
        maxWidth: "360px",
        height: "120px",
        cursor: "pointer",
      },
    },
    fullscreen: {
      true: {
        height: "100vh",
        borderRadius: 0,
      },
    },
  },
  defaultVariants: {
    active: false,
  },
});

const ResizeHandle = styled("div", {
  base: {
    width: "100%",
    height: "var(--gap-md)",
    flexShrink: 0,
    cursor: "row-resize",
    touchAction: "none",

    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    "&::after": {
      content: '""',
      width: "48px",
      height: "4px",
      borderRadius: "var(--borderRadius-full)",
      background: "var(--md-sys-color-outline-variant)",
    },
  },
});
