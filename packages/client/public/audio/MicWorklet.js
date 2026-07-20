/**
 * AudioWorkletProcessor implementing a mic processing chain: input gain,
 * a noise gate (mutes audio below a threshold), and automatic gain
 * control that pushes the signal toward a target loudness. Runs entirely
 * on the audio rendering thread; parameters are updated live via
 * postMessage without recreating the audio graph.
 *
 * Plain JS (not TypeScript) served as a static asset from public/, loaded
 * via audioContext.audioWorklet.addModule() at runtime (see
 * MicProcessor.ts) - AudioWorkletGlobalScope has no DOM access and isn't
 * part of Vite's normal build pipeline, so this can't go through the
 * regular TS/bundler transform the way app code does.
 */

const DEFAULT_PARAMS = {
  gain: 1,
  gateEnabled: false,
  gateThresholdDb: -50,
  agcEnabled: false,
  agcTargetDb: -18,
};

// Envelope smoothing time constants (seconds), converted to per-sample
// coefficients at process() time based on the actual sample rate.
const GATE_ATTACK_S = 0.005; // fast: open quickly when speech starts
const GATE_RELEASE_S = 0.15; // slower: avoid clipping word endings
const AGC_ENVELOPE_S = 0.4; // slow RMS tracking, avoids reacting to single loud transients
const AGC_GAIN_SMOOTH_S = 0.6; // how quickly AGC gain correction moves, avoids audible pumping

const AGC_MAX_GAIN_DB = 24; // don't boost a near-silent mic into pure noise
const AGC_MIN_GAIN_DB = -24;

function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

function linearToDb(v) {
  return v > 0 ? 20 * Math.log10(v) : -Infinity;
}

class MicWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.params = { ...DEFAULT_PARAMS };

    this.gateEnvelope = 0;
    this.gateGain = 1;

    this.agcEnvelope = 0;
    this.agcGainDb = 0;

    this.port.onmessage = (event) => {
      Object.assign(this.params, event.data);
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const gateAttack = 1 - Math.exp(-1 / (sampleRate * GATE_ATTACK_S));
    const gateRelease = 1 - Math.exp(-1 / (sampleRate * GATE_RELEASE_S));
    const agcEnvCoeff = 1 - Math.exp(-1 / (sampleRate * AGC_ENVELOPE_S));
    const agcGainCoeff = 1 - Math.exp(-1 / (sampleRate * AGC_GAIN_SMOOTH_S));

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (!inCh || !outCh) continue;

      for (let i = 0; i < inCh.length; i++) {
        let sample = inCh[i] * this.params.gain;

        // Envelope follower (shared amplitude estimate for gate + AGC)
        const abs = Math.abs(sample);

        if (this.params.gateEnabled) {
          const coeff = abs > this.gateEnvelope ? gateAttack : gateRelease;
          this.gateEnvelope += coeff * (abs - this.gateEnvelope);

          const envelopeDb = linearToDb(this.gateEnvelope);
          const targetGateGain =
            envelopeDb >= this.params.gateThresholdDb ? 1 : 0;
          // Smooth the gate's own transition to avoid audible clicks
          this.gateGain += gateRelease * (targetGateGain - this.gateGain);
          sample *= this.gateGain;
        }

        if (this.params.agcEnabled) {
          const postGateAbs = Math.abs(sample);
          this.agcEnvelope += agcEnvCoeff * (postGateAbs - this.agcEnvelope);

          const envelopeDb = linearToDb(this.agcEnvelope);
          if (Number.isFinite(envelopeDb)) {
            const desiredGainDb = this.params.agcTargetDb - envelopeDb;
            const clampedDesired = Math.min(
              AGC_MAX_GAIN_DB,
              Math.max(AGC_MIN_GAIN_DB, desiredGainDb),
            );
            this.agcGainDb += agcGainCoeff * (clampedDesired - this.agcGainDb);
          }
          sample *= dbToLinear(this.agcGainDb);
        }

        outCh[i] = sample;
      }
    }

    return true;
  }
}

registerProcessor("mic-worklet", MicWorkletProcessor);
