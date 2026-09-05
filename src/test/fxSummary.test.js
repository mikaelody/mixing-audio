// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EFFECTS, EFFECTS_BY_ID, EQ_PRESETS_10, EQ_PRESETS_20, fxSummary } from '../audio/effectsConfig.js';

/* Keterangan chip di fx rack. Kontraknya: SETIAP efek dapat keterangan yang
   tidak kosong, preset dikenali dari nilainya, dan yang tidak cocok preset
   apa pun jatuh ke 'Custom' — bukan string kosong. */
describe('fxSummary', () => {
    it('setiap efek di katalog punya keterangan non-kosong dengan params default', () => {
        for (const eff of EFFECTS) {
            const p = {};
            (eff.fields || []).forEach((f) => {
                if (f.def !== undefined) p[f.id] = f.def;
            });
            const s = fxSummary(eff, p);
            expect(typeof s, eff.id).toBe('string');
            expect(s.length, eff.id).toBeGreaterThan(0);
        }
    });

    it('Graphic EQ menyebut nama preset saat gain-nya persis preset', () => {
        const eq = EFFECTS_BY_ID.graphicEQ;
        const rock = Object.fromEntries(EQ_PRESETS_10.Rock.map((v, i) => ['g' + i, v]));
        expect(fxSummary(eq, rock)).toBe('Rock');

        const eq20 = EFFECTS_BY_ID.graphicEQ20;
        const dance20 = Object.fromEntries(EQ_PRESETS_20.Dance.map((v, i) => ['g' + i, v]));
        expect(fxSummary(eq20, dance20)).toBe('Dance');
    });

    it('EQ dengan gain yang tidak cocok preset mana pun = Custom', () => {
        const eq = EFFECTS_BY_ID.graphicEQ;
        const weird = Object.fromEntries(EQ_PRESETS_10.Rock.map((v, i) => ['g' + i, i === 3 ? v + 7.5 : v]));
        expect(fxSummary(eq, weird)).toBe('Custom');
    });

    it('preset yang cocok disebut namanya; nilai bebas jadi Custom + angkanya', () => {
        const gain = EFFECTS_BY_ID.gain;
        /* nilai persis preset → cukup nama presetnya, tidak diulang angkanya */
        expect(fxSummary(gain, { gainDb: 6 })).toBe('Boost +6 dB');
        /* di luar preset → 'Custom' + parameter utama, sesuai permintaan user */
        expect(fxSummary(gain, { gainDb: -7.5 })).toBe('Custom · -7.5 dB');
        /* efek tanpa daftar preset tetap diberi label Custom + parameter utama */
        expect(fxSummary(EFFECTS_BY_ID.delay, { dTime: 350, dFeedback: 30, dMix: 25 })).toBe('Custom · 350 ms');
    });

    it('toggle yang aktif disebut namanya (bukti Preserve Pitch terbaca di chip)', () => {
        const pr = EFFECTS_BY_ID.playbackRate;
        expect(fxSummary(pr, { prRate: 2, prPreserve: true })).toBe('Custom · 2x · Preserve Pitch');
        expect(fxSummary(pr, { prRate: 0.5, prPreserve: false })).toBe('Custom · 0.5x');
    });

    it('efek tanpa parameter tetap dapat keterangan, bukan string kosong', () => {
        expect(fxSummary(EFFECTS_BY_ID.reverse, {})).toBe('Custom');
        expect(fxSummary(EFFECTS_BY_ID.invert, {})).toBe('Custom');
    });
});
