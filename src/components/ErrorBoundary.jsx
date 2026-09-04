import React from 'react';

/* Tanpa ini satu throw di React = layar putih total tanpa pesan.
   componentDidCatch adalah satu-satunya cara React menangkapnya. */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { err: null };
    }

    static getDerivedStateFromError(err) {
        return { err };
    }

    componentDidCatch(err, info) {
        console.error('Mixing Audio crash:', err, info);
    }

    render() {
        if (!this.state.err) return this.props.children;
        return (
            <div className="crash">
                <h1>Aplikasi berhenti tak terduga</h1>
                <p>Draft yang sudah disimpan tetap aman — muat ulang halaman lalu buka File → Open Local Drafts.</p>
                <pre>{String(this.state.err && this.state.err.message ? this.state.err.message : this.state.err)}</pre>
                <button onClick={() => location.reload()}>Muat ulang</button>
            </div>
        );
    }
}
