// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomFxBar from '../components/BottomFxBar.jsx'

describe('BottomFxBar — remove buttons', () => {
  const dummyTrack = {
    id: 't1',
    name: 'Vocal',
    playbackRate: 1.5,
    pitchComp: true,
    baked: [
      { id: 'normalize', params: { normLevel: -1 }, region: null },
      { id: 'reverse', params: {}, region: [1, 2] }
    ],
    fxChain: [
      { id: 'gain', type: 'Gain', params: { gainDb: 3 }, node: { dispose: vi.fn() } },
      { id: 'compressor', type: 'Compressor', params: { compThresh: -20 }, node: { dispose: vi.fn() } }
    ]
  }

  it('renders all slots with remove buttons and triggers callbacks on click', () => {
    const onRemoveRate = vi.fn()
    const onRemoveBaked = vi.fn()
    const onRemoveFx = vi.fn()

    render(
      <BottomFxBar
        track={dummyTrack}
        hasSelection={false}
        selStart={null}
        selEnd={null}
        onAddEffect={vi.fn()}
        onAddToSelection={vi.fn()}
        onRemoveFx={onRemoveFx}
        onEditFx={vi.fn()}
        onEditRate={vi.fn()}
        onRemoveRate={onRemoveRate}
        onEditBaked={vi.fn()}
        onRemoveBaked={onRemoveBaked}
        onClose={vi.fn()}
      />
    )

    // Total slots: 1 (Rate) + 2 (Baked) + 2 (Fx) = 5 slot remove buttons + 1 header close button
    const closeHeaderBtn = screen.getByTitle('Tutup rack')
    expect(closeHeaderBtn).toBeDefined()

    const removeBtns = document.querySelectorAll('.fx-slot-x')
    expect(removeBtns.length).toBe(5)

    // Click remove speed (first slot remove button)
    fireEvent.click(removeBtns[0])
    expect(onRemoveRate).toHaveBeenCalledTimes(1)

    // Click remove baked 0
    fireEvent.click(removeBtns[1])
    expect(onRemoveBaked).toHaveBeenCalledWith(0)

    // Click remove baked 1
    fireEvent.click(removeBtns[2])
    expect(onRemoveBaked).toHaveBeenCalledWith(1)

    // Click remove realtime fx 0
    fireEvent.click(removeBtns[3])
    expect(onRemoveFx).toHaveBeenCalledWith(0)

    // Click remove realtime fx 1
    fireEvent.click(removeBtns[4])
    expect(onRemoveFx).toHaveBeenCalledWith(1)
  })
})
