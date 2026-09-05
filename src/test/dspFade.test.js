// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fadeBuffer, normalizeBuffer, reverseBuffer, invertBuffer } from '../audio/dsp.js';

/* Buffer palsu minimal: cukup punya getChannelData/length/sampleRate/numberOfChannels. */
function fakeBuffer(samples, channels = 1, sampleRate = 1000) {
    const data = Array.from({ length: channels }, () => Float32Array.from(samples));
    return {
        numberOfChannels: channels,
        length: samples.length,
        sampleRate,
        duration: samples.length / sampleRate,
        getChannelData: (c) => data[c],
    };
}

describe('fadeBuffer', () => {
    it('fade in meredam AWAL buffer dan membiarkan ekornya utuh', () => {
        const b = fakeBuffer(new Array(1000).fill(1));
        fadeBuffer(b, 'in', 200); // 200 ms @1000 Hz = 200 sample
        const d = b.getChannelData(0);
        expect(d[0]).toBe(0);
        expect(d[100]).toBeCloseTo(0.5, 5);
        expect(d[199]).toBeCloseTo(0.995, 3);
        expect(d[200]).toBe(1); // di luar rentang fade → utuh
        expect(d[999]).toBe(1);
    });

    it('fade out meredam EKOR buffer, bukan awalnya', () => {
        const b = fakeBuffer(new Array(1000).fill(1));
        fadeBuffer(b, 'out', 200);
        const d = b.getChannelData(0);
        expect(d[0]).toBe(1); // awal harus tetap penuh
        expect(d[799]).toBe(1);
        expect(d[800]).toBe(1); // sample pertama rentang fade = 1 - 0/200
        expect(d[900]).toBeCloseTo(0.5, 5);
        expect(d[999]).toBeCloseTo(0.005, 3);
    });

    it('durasi fade lebih panjang dari buffer tidak melewati batas array', () => {
        const b = fakeBuffer(new Array(100).fill(1));
        fadeBuffer(b, 'out', 5000);
        const d = b.getChannelData(0);
        expect(d.length).toBe(100);
        expect(Number.isFinite(d[0])).toBe(true);
        expect(d[99]).toBeCloseTo(0.01, 3);
    });

    it('fade 0 ms tidak mengubah apa pun', () => {
        const b = fakeBuffer(new Array(50).fill(0.5));
        fadeBuffer(b, 'in', 0);
        expect(Array.from(b.getChannelData(0))).toEqual(new Array(50).fill(0.5));
    });
});

describe('efek destruktif lain tetap konsisten', () => {
    it('normalize menaikkan puncak ke target', () => {
        const b = fakeBuffer([0.1, -0.2, 0.05]);
        normalizeBuffer(b, 0.8);
        const d = b.getChannelData(0);
        expect(Math.max(...Array.from(d).map(Math.abs))).toBeCloseTo(0.8, 5);
    });

    it('reverse membalik urutan sample', () => {
        const b = fakeBuffer([1, 2, 3, 4]);
        reverseBuffer(b);
        expect(Array.from(b.getChannelData(0))).toEqual([4, 3, 2, 1]);
    });

    it('invert membalik polaritas', () => {
        const b = fakeBuffer([0.5, -0.25]);
        invertBuffer(b);
        const d = b.getChannelData(0);
        expect(d[0]).toBeCloseTo(-0.5, 6);
        expect(d[1]).toBeCloseTo(0.25, 6);
    });
});
