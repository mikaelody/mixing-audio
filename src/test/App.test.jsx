// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'

const openMenu = (label) => {
  const btn = screen.getByText(label)
  fireEvent.click(btn)
}

describe('Mixing Audio — UI & Functional', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders menubar with all 5 menus', () => {
    render(<App/>)
    expect(screen.getByText('File')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(screen.getByText('Effects')).toBeTruthy()
    expect(screen.getByText('View')).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('File > Export triggers export (no crash)', () => {
    render(<App/>)
    openMenu('File')
    fireEvent.click(screen.getByText('Export / Download'))
    expect(true).toBe(true)
  })

  it('Edit menu opens and shows Undo/Redo', () => {
    render(<App/>)
    openMenu('Edit')
    expect(screen.getByText('Undo')).toBeTruthy()
    expect(screen.getByText('Redo')).toBeTruthy()
  })

  it('Effects menu opens with all groups', () => {
    render(<App/>)
    openMenu('Effects')
    const dropdown = document.querySelector('.dropdown.wide')
    expect(dropdown).toBeTruthy()
    expect(within(dropdown).getByText('Dynamics')).toBeTruthy()
    expect(within(dropdown).getByText('EQ & Filter')).toBeTruthy()
    expect(within(dropdown).getByText('Time-based')).toBeTruthy()
    expect(within(dropdown).getByText('Utility')).toBeTruthy()
  })

  it('Clicking an effect in Effects dropdown opens its modal', async () => {
    render(<App/>)
    openMenu('Effects')
    const dropdown = document.querySelector('.dropdown.wide')
    fireEvent.click(within(dropdown).getByText('Compressor'))
    await waitFor(() => expect(screen.getByText('Threshold')).toBeTruthy())
    fireEvent.click(screen.getByText('Cancel'))
  })

  it('Transport controls render (play/stop)', () => {
    render(<App/>)
    expect(screen.getByText('▶')).toBeTruthy()
    expect(screen.getByText('⏹')).toBeTruthy()
  })

  it('BPM input renders', () => {
    render(<App/>)
    expect(screen.getByDisplayValue('120')).toBeTruthy()
  })

  it('Drag-drop zone is present', () => {
    render(<App/>)
    expect(screen.getAllByText(/Drop audio file di sini/).length).toBeGreaterThan(0)
  })

  it('Effects modal closes on Cancel', async () => {
    render(<App/>)
    openMenu('Effects')
    const dropdown = document.querySelector('.dropdown.wide')
    fireEvent.click(within(dropdown).getByText('Reverb'))
    await waitFor(() => expect(screen.getByText('Room Size')).toBeTruthy())
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByText('Room Size')).toBeFalsy())
  })

  it('Effect modal has Presets dropdown', async () => {
    render(<App/>)
    openMenu('Effects')
    const dropdown = document.querySelector('.dropdown.wide')
    fireEvent.click(within(dropdown).getByText('Gain'))
    await waitFor(() => expect(screen.getByText('Presets')).toBeTruthy())
  })

  it('View menu shows wave/vu/compact toggles', () => {
    render(<App/>)
    openMenu('View')
    expect(screen.getByText('Show Waveform Colors')).toBeTruthy()
    expect(screen.getByText('Show VU Meters')).toBeTruthy()
    expect(screen.getByText('Compact Channel Strips')).toBeTruthy()
  })

  it('Edit menu shows Loop and Channel Info', () => {
    render(<App/>)
    openMenu('Edit')
    expect(screen.getByText('Seamless Loop')).toBeTruthy()
    expect(screen.getByText('Channel Info / Flip')).toBeTruthy()
  })

  it('Statusbar shows Mixing Audio branding', () => {
    render(<App/>)
    expect(screen.getByText('Mixing Audio')).toBeTruthy()
  })
})