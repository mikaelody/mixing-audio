// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

/* Yang harus gagal kalau logika rusak: satu throw di child harus jadi layar
   pesan, bukan DOM kosong (layar putih). */
function Boom() {
    throw new Error('ledakan uji')
}

describe('ErrorBoundary', () => {
    it('menampilkan crash screen alih-alih layar putih saat child throw', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        )
        expect(screen.getByText(/Aplikasi berhenti/i)).toBeTruthy()
        expect(document.body.textContent).toContain('ledakan uji')
        spy.mockRestore()
    })

    it('meneruskan children apa adanya saat tidak ada error', () => {
        render(
            <ErrorBoundary>
                <p>isi normal</p>
            </ErrorBoundary>
        )
        expect(screen.getByText('isi normal')).toBeTruthy()
    })
})
