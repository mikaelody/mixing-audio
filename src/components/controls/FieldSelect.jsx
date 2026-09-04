import { useState } from 'react';

export default function FieldSelect({ label, options, value, onChange }) {
    return (
        <div className="h-row">
            <div className="h-row-top">
                <span className="h-label">{label}</span>
            </div>
            <select className="field-select" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((o) => (
                    <option key={o}>{o}</option>
                ))}
            </select>
        </div>
    );
}

export function ActionButton({ label, sub }) {
    const [state, setState] = useState('idle');
    return (
        <div className="h-row">
            <div
                className="action-btn"
                onClick={() => {
                    setState('rec');
                    setTimeout(() => setState('done'), 1400);
                }}
            >
                {state === 'rec' ? '● Merekam profil noise…' : state === 'done' ? '✓ Profil noise tersimpan' : label}
            </div>
            <div className="action-sub">{sub}</div>
        </div>
    );
}
