import type {
  AudioProcessorOptions,
  Room,
  TrackProcessor,
} from "livekit-client";
import { DenoiseTrackProcessor } from "livekit-rnnoise-processor";

export type MicProcessorOptions = {
  /** Linear input gain multiplier, e.g. 1.0 = unity, 3.0 = +300% */
  gain: number;
  noiseSuppressionEnabled: boolean;
  workletCDNURL?: string;
  gateEnabled: boolean;
  /** dBFS threshold below which the mic is muted */
  gateThresholdDb: number;
  agcEnabled: boolean;
  /** dBFS loudness the AGC tries to normalise the signal toward */
  agcTargetDb: number;
};

// Plain JS, served as a static asset (see public/audio/MicWorklet.js) -
// AudioWorkletGlobalScope isn't part of Vite's normal TS/bundler pipeline,
// so this can't be imported/transformed the way app code is.
const workletUrl = `${import.meta.env.BASE_URL}audio/MicWorklet.js`;

/**
 * Combined mic processing chain implementing LiveKit's TrackProcessor
 * interface: input gain -> optional RNNoise denoising -> noise gate ->
 * automatic gain control toward a target loudness. Only one processor can
 * be attached to a track at a time, so all four stages live here rather
 * than as separate chained processors.
 */
export class MicProcessor implements TrackProcessor<
  import("livekit-client").Track.Kind.Audio,
  AudioProcessorOptions
> {
  readonly name = "mic-processor";
  processedTrack?: MediaStreamTrack;

  private opts: MicProcessorOptions;
  private audioOpts?: AudioProcessorOptions;

  private sourceNode?: MediaStreamAudioSourceNode;
  private denoise?: DenoiseTrackProcessor;
  private workletNode?: AudioWorkletNode;

  private static readonly loadedContexts = new WeakSet<BaseAudioContext>();

  constructor(opts: MicProcessorOptions) {
    this.opts = opts;
  }

  get noiseSuppressionEnabled(): boolean {
    return this.opts.noiseSuppressionEnabled;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.build(opts);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    this.teardown();
    await this.build(opts);
  }

  async onPublish(_room: Room): Promise<void> {
    /* no-op */
  }

  async onUnpublish(): Promise<void> {
    /* no-op */
  }

  async destroy(): Promise<void> {
    this.teardown();
  }

  /**
   * Update live parameters (gain, gate, AGC) without rebuilding the audio
   * graph. Toggling noise suppression changes which nodes are connected,
   * so it requires calling restart() instead.
   */
  updateParams(
    opts: Partial<
      Pick<
        MicProcessorOptions,
        | "gain"
        | "gateEnabled"
        | "gateThresholdDb"
        | "agcEnabled"
        | "agcTargetDb"
      >
    >,
  ) {
    Object.assign(this.opts, opts);
    this.workletNode?.port.postMessage({
      gain: this.opts.gain,
      gateEnabled: this.opts.gateEnabled,
      gateThresholdDb: this.opts.gateThresholdDb,
      agcEnabled: this.opts.agcEnabled,
      agcTargetDb: this.opts.agcTargetDb,
    });
  }

  private async build(opts: AudioProcessorOptions): Promise<void> {
    this.audioOpts = opts;
    const ctx = opts.audioContext;

    if (!MicProcessor.loadedContexts.has(ctx)) {
      await ctx.audioWorklet.addModule(workletUrl);
      MicProcessor.loadedContexts.add(ctx);
    }

    this.workletNode = new AudioWorkletNode(ctx, "mic-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    this.workletNode.port.postMessage({
      gain: this.opts.gain,
      gateEnabled: this.opts.gateEnabled,
      gateThresholdDb: this.opts.gateThresholdDb,
      agcEnabled: this.opts.agcEnabled,
      agcTargetDb: this.opts.agcTargetDb,
    });

    const destination = ctx.createMediaStreamDestination();

    if (this.opts.noiseSuppressionEnabled) {
      // raw mic -> RNNoise (own worklet, produces its own processed track)
      // -> gain/gate/AGC worklet -> destination
      this.denoise = new DenoiseTrackProcessor({
        workletCDNURL: this.opts.workletCDNURL,
      });
      await this.denoise.init(opts);

      this.sourceNode = ctx.createMediaStreamSource(
        new MediaStream([this.denoise.processedTrack!]),
      );
    } else {
      this.sourceNode = ctx.createMediaStreamSource(
        new MediaStream([opts.track]),
      );
    }
    this.sourceNode.connect(this.workletNode);

    this.workletNode.connect(destination);
    this.processedTrack = destination.stream.getAudioTracks()[0];
  }

  private teardown() {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.denoise?.destroy();
    this.workletNode = undefined;
    this.sourceNode = undefined;
    this.denoise = undefined;
    this.processedTrack = undefined;
  }
}
