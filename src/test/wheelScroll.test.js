import { describe, it, expect } from 'vitest';
import { wheelPlan, followPlan } from '../App.jsx';

/* el palsu: hanya angka-angka layout yang dibaca wheelPlan */
const el = (o = {}) => ({ scrollLeft: 0, scrollWidth: 2000, clientWidth: 800, scrollHeight: 400, clientHeight: 400, ...o });
const ev = (o = {}) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

describe('wheelPlan', () => {
    it('mouse wheel biasa menggeser timeline mendatar (keluhan: "scroll tidak bisa")', () => {
        expect(wheelPlan(ev({ deltaY: 120 }), el())).toEqual({ kind: 'x', next: 120 });
    });

    it('Ctrl/⌘ tetap zoom, bukan scroll', () => {
        expect(wheelPlan(ev({ deltaY: -100, ctrlKey: true }), el()).kind).toBe('zoom');
        expect(wheelPlan(ev({ deltaY: -100, ctrlKey: true }), el()).factor).toBeGreaterThan(1);
        expect(wheelPlan(ev({ deltaY: 100, metaKey: true }), el()).factor).toBeLessThan(1);
    });

    it('tidak melampaui batas kiri/kanan', () => {
        expect(wheelPlan(ev({ deltaY: -500 }), el({ scrollLeft: 100 })).next).toBe(0);
        expect(wheelPlan(ev({ deltaY: 9999 }), el()).next).toBe(1200); // scrollWidth - clientWidth
    });

    it('deltaX (trackpad) diserahkan ke native overflow-x', () => {
        expect(wheelPlan(ev({ deltaX: 40, deltaY: 5 }), el()).kind).toBe('native');
    });

    it('kalau ada ruang scroll vertikal, deltaY untuk vertikal — kecuali Shift', () => {
        const tall = el({ scrollHeight: 900 });
        expect(wheelPlan(ev({ deltaY: 120 }), tall).kind).toBe('native');
        expect(wheelPlan(ev({ deltaY: 120, shiftKey: true }), tall)).toEqual({ kind: 'x', next: 120 });
    });

    it('timeline yang muat penuh tidak perlu digeser', () => {
        expect(wheelPlan(ev({ deltaY: 120 }), el({ scrollWidth: 800 })).kind).toBe('native');
    });

    it('deltaMode=DOM_DELTA_LINE dikali 16px per baris', () => {
        expect(wheelPlan(ev({ deltaY: 3, deltaMode: 1 }), el()).next).toBe(48);
    });
});

describe('followPlan', () => {
    it('playhead keluar viewport → geser ke ~60% viewport', () => {
        expect(followPlan(1000, 0, 800, true)).toEqual({ armed: true, scrollTo: 520 });
    });

    it('user sedang scroll manual (armed=false) → JANGAN rebut scroll (keluhan: "balik ke bagian yg baru berjalan")', () => {
        expect(followPlan(1000, 0, 800, false)).toEqual({ armed: false, scrollTo: null });
    });

    it('playhead masuk viewport lagi → follow menyala sendiri', () => {
        expect(followPlan(300, 0, 800, false)).toEqual({ armed: true, scrollTo: null });
    });

    it('playhead terlihat → tidak ada scroll sama sekali', () => {
        expect(followPlan(300, 0, 800, true).scrollTo).toBe(null);
    });

    it('viewport belum terukur (jsdom) → tidak melakukan apa-apa', () => {
        expect(followPlan(1000, 0, 0, false)).toEqual({ armed: false, scrollTo: null });
    });
});
