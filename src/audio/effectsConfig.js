/* Effect catalog — drives the topbar "Effects" menu and the configuration popups.
   field types: h (slider), hro (read-only meter), dd (dropdown), tg (toggle switch), act (action button)
   custom: 'paragraphic' | 'graphicEQ' | 'graphicEQ20' | 'gain' | null
   Each effect maps to a real audio process in dsp/applyEffect.js */

export const field = (id, label, min, max, step, def, unit = '') => ({ type: 'h', id, label, min, max, step, def, unit });
export const hro = (id, label, def, unit = '') => ({ type: 'hro', id, label, def, unit });
export const dd = (id, label, options) => ({ type: 'dd', id, label, options });
export const tg = (id, label, sub, def) => ({ type: 'tg', id, label, sub, def });
export const act = (id, label, sub) => ({ type: 'act', id, label, sub });

export const GRAPHIC_EQ_10 = ['<32hz', '64hz', '125hz', '250hz', '500hz', '1000hz', '2000hz', '4000hz', '8000hz', '>16k'];
export const GRAPHIC_EQ_20 = ['32', '45', '63', '90', '125', '180', '250', '355', '500', '710', '1000', '1400', '2000', '2800', '4000', '5600', '8000', '11000', '16000', '20000'];

/* Classic 10-band graphic EQ presets (dB per band, matching the list of
   presets users know from player apps: Default…Techno Rock). */
export const EQ_PRESETS_10 = {
    Default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Classic: [0, 0, 0, 0, 0, 0, 0, -2, -2, -2],
    Dance: [6, 5, 2, 0, 0, -1, -1, 0, 2, 3],
    Club: [4, 4, 1, 0, 0, 0, 0, 0, 2, 3],
    'Full Bass': [8, 7, 5, 2, 0, 0, -1, -2, -3, -4],
    'Full Bass Treble': [7, 6, 3, 1, 0, 0, 0, 1, 3, 6],
    'Full Treble': [-4, -3, -2, -1, 0, 0, 1, 3, 5, 7],
    'Laptop Speakers': [2, 2, 0, -1, 0, 2, 4, 4, 3, 2],
    'Large Hall': [4, 4, 2, 1, 0, 0, 1, 2, 3, 4],
    Live: [-2, 0, 1, 2, 2, 2, 2, 1, 1, 2],
    Party: [4, 4, 2, 0, 0, 0, 0, 1, 2, 4],
    Pop: [-1, 0, 1, 3, 4, 3, 1, -1, -1, -1],
    Reggae: [2, 2, 0, -1, -1, 0, 1, 1, 0, 0],
    Rock: [4, 3, 1, -1, -1, 1, 3, 3, 3, 3],
    Ska: [-1, -1, 0, 1, 2, 2, 2, 2, 1, 0],
    Soft: [2, 1, 0, -1, 0, 1, 2, 3, 3, 2],
    'Soft Rock': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    'Techno Rock': [4, 3, 2, 0, -1, -1, 0, 1, 2, 4],
};

/* Linear-interpolate a 10-band curve to 20 bands so both EQs share presets. */
function expand10to20(a) {
    const out = [];
    for (let i = 0; i < 20; i++) {
        const pos = (i / 19) * 9;
        const lo = Math.floor(pos),
            frac = pos - lo;
        const hi = Math.min(9, lo + 1);
        out.push(Math.round((a[lo] + (a[hi] - a[lo]) * frac) * 10) / 10);
    }
    return out;
}
export const EQ_PRESETS_20 = Object.fromEntries(Object.entries(EQ_PRESETS_10).map(([k, v]) => [k, expand10to20(v)]));

export const EFFECTS = [
    {
        id: 'gain',
        name: 'Gain',
        group: 'Dynamics',
        presets: { 'Boost +6 dB': { gainDb: 6 }, 'Boost +3 dB': { gainDb: 3 }, 'Cut -6 dB': { gainDb: -6 }, 'Cut -12 dB': { gainDb: -12 } },
        fields: [field('gainDb', 'Gain', -24, 24, 0.5, 0, ' dB')],
    },

    {
        id: 'fadeIn',
        name: 'Fade In',
        group: 'Utility',
        presets: { 'Cepat (0.3s)': { fiDur: 0.3, fiCurve: 'Linear' }, 'Halus (2s)': { fiDur: 2, fiCurve: 'S-Curve' }, 'Panjang (5s)': { fiDur: 5, fiCurve: 'Logarithmic' } },
        fields: [field('fiDur', 'Duration', 0, 10, 0.1, 1.0, ' s'), dd('fiCurve', 'Curve', ['Linear', 'Logarithmic', 'S-Curve'])],
    },

    {
        id: 'fadeOut',
        name: 'Fade Out',
        group: 'Utility',
        presets: { 'Cepat (0.3s)': { foDur: 0.3, foCurve: 'Linear' }, 'Halus (2s)': { foDur: 2, foCurve: 'S-Curve' }, 'Panjang (5s)': { foDur: 5, foCurve: 'Logarithmic' } },
        fields: [field('foDur', 'Duration', 0, 10, 0.1, 1.5, ' s'), dd('foCurve', 'Curve', ['Linear', 'Logarithmic', 'S-Curve'])],
    },

    {
        id: 'noiseReduction',
        name: 'Noise Reduction (Voice)',
        group: 'Restoration',
        fields: [
            act('learnNoise', 'Learn Noise Profile', 'Rekam 2 detik bagian "silent" untuk sampling profil noise'),
            field('nrSens', 'Sensitivity', 0, 100, 1, 60, '%'),
            field('nrAmount', 'Reduction Amount', 0, 48, 1, 12, ' dB'),
            field('nrFloor', 'Noise Floor', -80, -20, 1, -50, ' dB'),
        ],
    },

    {
        id: 'paragraphicEQ',
        name: 'Paragraphic EQ',
        group: 'EQ & Filter',
        wide: true,
        custom: 'paragraphic',
        fields: [
            field('peq0Freq', 'Band 1 Freq', 20, 20000, 10, 100, ' Hz'),
            field('peq0Gain', 'Band 1 Gain', -15, 15, 0.5, 0, ' dB'),
            field('peq0Q', 'Band 1 Q', 0.1, 10, 0.1, 1, ''),
            field('peq1Freq', 'Band 2 Freq', 20, 20000, 10, 500, ' Hz'),
            field('peq1Gain', 'Band 2 Gain', -15, 15, 0.5, 0, ' dB'),
            field('peq1Q', 'Band 2 Q', 0.1, 10, 0.1, 1, ''),
            field('peq2Freq', 'Band 3 Freq', 20, 20000, 10, 2000, ' Hz'),
            field('peq2Gain', 'Band 3 Gain', -15, 15, 0.5, 0, ' dB'),
            field('peq2Q', 'Band 3 Q', 0.1, 10, 0.1, 1, ''),
            field('peq3Freq', 'Band 4 Freq', 20, 20000, 10, 8000, ' Hz'),
            field('peq3Gain', 'Band 4 Gain', -15, 15, 0.5, 0, ' dB'),
            field('peq3Q', 'Band 4 Q', 0.1, 10, 0.1, 1, ''),
        ],
    },

    {
        id: 'compressor',
        name: 'Compressor',
        group: 'Dynamics',
        fields: [
            field('cThresh', 'Threshold', -60, 0, 0.5, -24, ' dB'),
            field('cKnee', 'Knee', 0, 40, 1, 30, ''),
            field('cRatio', 'Ratio', 1, 20, 0.5, 12, ''),
            field('cAttack', 'Attack', 0, 1, 0.001, 0.003, ' s'),
            field('cRelease', 'Release', 0, 2, 0.01, 0.25, ' s'),
            field('cMakeup', 'Makeup', 0, 24, 0.5, 0, ' dB'),
            hro('cReduction', 'Gain Reduction', 0, ' dB'),
        ],
    },

    { id: 'normalize', name: 'Normalize', group: 'Dynamics', fields: [field('nTarget', 'Target Level', -24, 0, 0.5, -1, ' dB'), dd('nMode', 'Normalize To', ['Peak', 'RMS (Loudness)'])] },

    { id: 'graphicEQ', name: 'Graphic EQ', group: 'EQ & Filter', wide: true, custom: 'graphicEQ', bands: GRAPHIC_EQ_10 },

    { id: 'graphicEQ20', name: 'Graphic EQ (20 bands)', group: 'EQ & Filter', wide: true, custom: 'graphicEQ20', bands: GRAPHIC_EQ_20 },

    {
        id: 'hardLimiter',
        name: 'Hard Limiter',
        group: 'Dynamics',
        fields: [field('hlCeiling', 'Ceiling', -3, 0, 0.1, -0.3, ' dB'), field('hlRelease', 'Release', 1, 500, 1, 50, ' ms'), tg('hlLookahead', 'True Peak Lookahead', 'Deteksi peak antar-sample untuk hasil lebih presisi', true)],
    },

    {
        id: 'delay',
        name: 'Delay',
        group: 'Time-based',
        fields: [field('dTime', 'Time', 1, 2000, 1, 350, ' ms'), field('dFeedback', 'Feedback', 0, 95, 1, 35, '%'), field('dMix', 'Mix', 0, 100, 1, 30, '%'), tg('dSync', 'Sync to Tempo', 'Kunci waktu delay ke BPM project', false)],
    },

    {
        id: 'distortion',
        name: 'Distortion',
        group: 'Time-based',
        fields: [field('disDrive', 'Drive', 0, 100, 1, 40, '%'), field('disTone', 'Tone', 0, 100, 1, 50, '%'), field('disMix', 'Mix', 0, 100, 1, 100, '%'), dd('disType', 'Type', ['Soft Clip', 'Hard Clip', 'Tube', 'Fuzz'])],
    },

    {
        id: 'reverb',
        name: 'Reverb',
        group: 'Time-based',
        fields: [field('rvRoom', 'Room Size', 0, 100, 1, 45, '%'), field('rvDamp', 'Damping', 0, 100, 1, 50, '%'), field('rvPre', 'Pre-Delay', 0, 200, 1, 20, ' ms'), field('rvWet', 'Wet / Dry', 0, 100, 1, 25, '%')],
    },

    {
        id: 'audioRepair',
        name: 'Audio Repair',
        group: 'Restoration',
        fields: [tg('arClicks', 'Remove Clicks & Pops', 'Deteksi dan perbaiki transient tajam mendadak', true), tg('arHum', 'Remove Hum (50/60 Hz)', 'Hilangkan dengungan listrik', false), field('arSens', 'Sensitivity', 0, 100, 1, 70, '%')],
    },

    {
        id: 'speedPitch',
        name: 'Speed Up / Slow Down (pitch)',
        group: 'Pitch & Time',
        desc: 'Ubah kecepatan + pitch bersamaan (seperti memutar piringan lebih cepat/lambat).',
        fields: [field('spRate', 'Playback Rate', 0.25, 4.0, 0.05, 1.0, 'x')],
    },

    {
        id: 'playbackRate',
        name: 'Speed / Playback Rate',
        group: 'Pitch & Time',
        desc: 'Ubah kecepatan tanpa mengubah pitch — cocok untuk latihan / transkripsi.',
        fields: [field('prRate', 'Playback Rate', 0.25, 4.0, 0.05, 1.0, 'x'), tg('prPreserve', 'Preserve Pitch', 'Pertahankan nada asli walau kecepatan berubah', true)],
    },

    { id: 'reverse', name: 'Reverse', group: 'Utility', desc: 'Membalik seluruh audio pada rentang terpilih (sample-by-sample). Tanpa parameter tambahan.', fields: [] },

    { id: 'invert', name: 'Invert', group: 'Utility', desc: 'Membalik polaritas fase audio. Berguna menghindari pembatalan fase saat digabung dengan track lain.', fields: [] },

    {
        id: 'removeSilence',
        name: 'Remove Silence',
        group: 'Utility',
        fields: [field('rsThresh', 'Threshold', -60, -10, 1, -40, ' dB'), field('rsMinDur', 'Min Silence Duration', 0.1, 5, 0.1, 0.5, ' s'), field('rsPad', 'Padding', 0, 500, 10, 100, ' ms')],
    },
];

export const EFFECT_GROUPS = ['Dynamics', 'EQ & Filter', 'Time-based', 'Restoration', 'Pitch & Time', 'Utility'];

export const EFFECTS_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));
