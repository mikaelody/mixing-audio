import * as Tone from 'tone';
import { applyBiquad, reverseBuffer, invertBuffer, normalizeBuffer, fadeBuffer, removeSilenceBuffer, buildEqNode, logBands } from './dsp.js';

/* Apply a single effect to a track. Returns one of:
   - { buffer:true }         -> destructive edit (App calls destructiveBuffer with the active buffer)
   - { fx:{type,node} }      -> non-destructive node to append to t.fxChain
   - { playbackRate }        -> set t.playbackRate
   - { flash }               -> just show a message (no audio change)
   The popup also carries params via `p` (the form values). */
export async function processEffect(eff, p) {
    switch (eff.id) {
        /* ---------- Dynamics ---------- */
        case 'gain': {
            const g = new Tone.Gain(p.gainDb || 0);
            return { fx: { type: 'Gain', node: g } };
        }
        case 'compressor':
            return {
                fx: {
                    type: 'Compressor',
                    node: new Tone.Compressor({
                        threshold: p.cThresh,
                        knee: p.cKnee,
                        ratio: p.cRatio,
                        attack: p.cAttack,
                        release: p.cRelease,
                    }),
                },
            };
        case 'hardLimiter':
            return { fx: { type: 'Hard Limiter', node: new Tone.Limiter(p.hlCeiling || -0.3) } };
        case 'normalize':
            return { buffer: true };

        /* ---------- EQ & Filter ---------- */
        case 'paragraphicEQ': {
            const freqs = [p.peq0Freq, p.peq1Freq, p.peq2Freq, p.peq3Freq];
            const gains = [p.peq0Gain, p.peq1Gain, p.peq2Gain, p.peq3Gain];
            const eq = buildEqNode(freqs, gains);
            return { fx: { type: 'Paragraphic EQ', node: eq.node }, eqMeta: { freqs, gains } };
        }
        case 'graphicEQ': {
            const freqs = logBands(10),
                gains = eff.bands.map((_, i) => p['g' + i] || 0);
            const eq = buildEqNode(freqs, gains);
            return { fx: { type: 'Graphic EQ', node: eq.node }, eqMeta: { freqs, gains } };
        }
        case 'graphicEQ20': {
            const freqs = logBands(20),
                gains = eff.bands.map((_, i) => p['g' + i] || 0);
            const eq = buildEqNode(freqs, gains);
            return { fx: { type: 'Graphic EQ (20 bands)', node: eq.node }, eqMeta: { freqs, gains } };
        }

        /* ---------- Time-based ---------- */
        case 'delay': {
            const d = new Tone.FeedbackDelay(p.dTime / 1000, p.dFeedback / 100);
            if (p.dMix !== undefined) d.wet.value = p.dMix / 100;
            return { fx: { type: 'Delay', node: d } };
        }
        case 'distortion':
            return { fx: { type: 'Distortion', node: new Tone.Distortion(p.disDrive / 100) } };
        case 'reverb': {
            const r = new Tone.Reverb({ decay: 1 + (p.rvRoom / 100) * 5, wet: (p.rvWet || 25) / 100, preDelay: (p.rvPre || 20) / 1000 });
            await r.generate();
            return { fx: { type: 'Reverb', node: r } };
        }

        /* ---------- Restoration ---------- */
        case 'noiseReduction':
            return { buffer: true };
        case 'audioRepair':
            return { buffer: true };

        /* ---------- Pitch & Time ---------- */
        case 'speedPitch':
            return { playbackRate: p.spRate };
        case 'playbackRate':
            return { playbackRate: p.prRate };

        /* ---------- Utility (destructive) ---------- */
        case 'fadeIn':
            return { buffer: true };
        case 'fadeOut':
            return { buffer: true };
        case 'reverse':
            return { buffer: true };
        case 'invert':
            return { buffer: true };
        case 'removeSilence':
            return { buffer: true };

        default:
            return { flash: `Efek "${eff.name}" belum didukung` };
    }
}

/* helper used by App for buffer-mode effects that need the active buffer.
   ALWAYS works on a deep clone so the live playback buffer is never mutated
   and the returned buffer is a NEW reference (App uses nb!==buf as 'did change'). */
export function destructiveBuffer(eff, buf, p) {
    if (!buf) return buf;
    const clone = (b) => {
        if (typeof b.clone === 'function') return b.clone();
        const nb = new OfflineAudioContext(b.numberOfChannels, b.length, b.sampleRate).createBuffer(b.numberOfChannels, b.length, b.sampleRate);
        for (let c = 0; c < b.numberOfChannels; c++) nb.getChannelData(c).set(b.getChannelData(c));
        return nb;
    };
    switch (eff.id) {
        case 'normalize':
            return normalizeBuffer(clone(buf), Math.pow(10, (p.nTarget || -1) / 20));
        case 'fadeIn':
            return fadeBuffer(clone(buf), 'in', Math.round((p.fiDur || 1) * 1000));
        case 'fadeOut':
            return fadeBuffer(clone(buf), 'out', Math.round((p.foDur || 1) * 1000));
        case 'reverse':
            return reverseBuffer(clone(buf));
        case 'invert':
            return invertBuffer(clone(buf));
        case 'removeSilence':
            return removeSilenceBuffer(clone(buf), Math.pow(10, (p.rsThresh || -40) / 20));
        case 'noiseReduction':
            return applyBiquad(clone(buf), 'highpass', Math.pow(10, (p.nrFloor || -50) / 20) * 1000);
        case 'audioRepair':
            return applyBiquad(clone(buf), 'highpass', 60); /* hum removal */
        default:
            return buf;
    }
}
