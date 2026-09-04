import * as Tone from 'tone';

export function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const ms = Math.floor((sec % 1) * 1000),
        tot = Math.floor(sec),
        m = Math.floor(tot / 60),
        s = tot % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms).padStart(3, '0')}`;
}

export function audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels,
        sr = buffer.sampleRate,
        frames = buffer.length;
    const blockAlign = numCh * 2,
        dataSize = frames * blockAlign;
    const ab = new ArrayBuffer(44 + dataSize),
        view = new DataView(ab);
    const ws = (o, s) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    ws(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    ws(8, 'WAVE');
    ws(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    ws(36, 'data');
    view.setUint32(40, dataSize, true);
    let off = 44;
    const ch = [];
    for (let c = 0; c < numCh; c++) ch.push(buffer.getChannelData(c));
    for (let i = 0; i < frames; i++)
        for (let c = 0; c < numCh; c++) {
            let s = Math.max(-1, Math.min(1, ch[c][i]));
            s = s < 0 ? s * 0x8000 : s * 0x7fff;
            view.setInt16(off, s, true);
            off += 2;
        }
    return new Blob([view], { type: 'audio/wav' });
}

export async function applyBiquad(buffer, type, freq, q = 1) {
    const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = off.createBufferSource();
    src.buffer = buffer;
    const filt = off.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    src.connect(filt);
    filt.connect(off.destination);
    src.start();
    return off.startRendering();
}

/* Deep-copy an AudioBuffer so destructive edits never mutate the live playback buffer. */
export function cloneBuffer(b) {
    if (typeof b.clone === 'function') return b.clone();
    const nb = new OfflineAudioContext(b.numberOfChannels, b.length, b.sampleRate).createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) nb.getChannelData(c).set(b.getChannelData(c));
    return nb;
}

export function reverseBuffer(b) {
    for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        d.reverse();
    }
    return b;
}
export function invertBuffer(b) {
    for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = -d[i];
    }
    return b;
}
export function normalizeBuffer(b, target = 0.95) {
    let max = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
            const a = Math.abs(d[i]);
            if (a > max) max = a;
        }
    }
    if (max > 0) {
        const g = target / max;
        for (let c = 0; c < b.numberOfChannels; c++) {
            const d = b.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= g;
        }
    }
    return b;
}
export function fadeBuffer(b, which, ms = 300) {
    const len = Math.floor((b.sampleRate * ms) / 1000);
    for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len && i < d.length; i++) {
            const t = which === 'in' ? i / len : 1 - i / len;
            d[i] *= t;
        }
    }
    return b;
}
export function removeSilenceBuffer(b, threshold = 0.01) {
    const d0 = b.getChannelData(0);
    let start = 0,
        end = d0.length - 1;
    while (start < end && Math.abs(d0[start]) < threshold) start++;
    while (end > start && Math.abs(d0[end]) < threshold) end--;
    const newLen = end - start + 1,
        numCh = b.numberOfChannels,
        sr = b.sampleRate;
    const out = new OfflineAudioContext(numCh, newLen, sr).createBuffer(numCh, newLen, sr);
    for (let c = 0; c < numCh; c++) {
        const s = b.getChannelData(c),
            dst = out.getChannelData(c);
        for (let i = 0; i < newLen; i++) dst[i] = s[start + i];
    }
    return out;
}

export function makeSampleBuffer() {
    const sr = Tone.context.sampleRate,
        dur = 4,
        off = new OfflineAudioContext(2, sr * dur, sr);
    [261.63, 329.63, 392, 523.25].forEach((f) => {
        const o = off.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = off.createGain();
        g.gain.value = 0.18;
        o.connect(g);
        g.connect(off.destination);
        o.start(0);
        o.stop(dur);
    });
    return off.startRendering();
}

/* N-band peaking-filter EQ wrapped as a single connectable node
   (input -> f0 -> f1 -> ... -> fN -> output) so it slots into the fxChain. */
export function buildEqNode(freqs, gains) {
    const input = new Tone.Gain(),
        output = new Tone.Gain();
    let prev = input;
    freqs.forEach((f, i) => {
        const filt = new Tone.Filter(Math.max(20, Math.min(20000, f)), 'peaking');
        filt.Q.value = 1;
        filt.gain.value = gains[i] || 0;
        prev.connect(filt);
        prev = filt;
    });
    prev.connect(output);
    return {
        input,
        output,
        node: input,
        dispose() {
            try {
                input.dispose();
            } catch (_) {}
            try {
                output.dispose();
            } catch (_) {}
        },
    };
}

export function logBands(n, minF = 20, maxF = 20000) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const f = Math.round(minF * Math.pow(maxF / minF, i / (n - 1)));
        out.push(f);
    }
    return out;
}

/* ---------- region selection (apply effect to part of a clip) ---------- */

/* Deep-copy just the [startSec, endSec] slice of a buffer (all channels).
   Returns a NEW AudioBuffer with the same sample rate. */
export function extractBufferRegion(buffer, startSec, endSec) {
    if (!buffer) return buffer;
    const sr = buffer.sampleRate;
    let s = Math.max(0, Math.floor(startSec * sr));
    let e = Math.min(buffer.length, Math.ceil(endSec * sr));
    if (e <= s) return null;
    const len = e - s;
    const out = new OfflineAudioContext(buffer.numberOfChannels, len, sr)
        .createBuffer(buffer.numberOfChannels, len, sr);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        out.getChannelData(c).set(buffer.getChannelData(c).subarray(s, e));
    }
    return out;
}

/* Return a NEW buffer where samples in [startSec,endSec] are replaced by the
   (already processed) regionBuffer. The regionBuffer length may differ from the
   original slice, so surrounding audio is re-joined around it. */
export function replaceBufferRegion(buffer, startSec, endSec, regionBuffer) {
    if (!buffer || !regionBuffer) return buffer;
    const sr = buffer.sampleRate;
    const s = Math.max(0, Math.floor(startSec * sr));
    const e = Math.min(buffer.length, Math.ceil(endSec * sr));
    const head = buffer.getChannelData(0).subarray(0, s);         // before selection
    const tail = buffer.getChannelData(0).subarray(e);            // after selection
    const ins = regionBuffer.length;                               // new region length (frames)
    const newLen = head.length + ins + tail.length;
    const out = new OfflineAudioContext(buffer.numberOfChannels, newLen, sr)
        .createBuffer(buffer.numberOfChannels, newLen, sr);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        dst.set(src.subarray(0, s), 0);
        dst.set(regionBuffer.getChannelData(c), head.length);
        dst.set(src.subarray(e), head.length + ins);
    }
    return out;
}

