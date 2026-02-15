import React, { useEffect, useRef } from 'react'
import { TranscriptSegment } from '../types'

type Props = {
  segments: TranscriptSegment[]
  liveText: string
  onSelectionChange: (text: string, range: { start: number; end: number } | null) => void
  onClear: () => void
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const TranscriptPane: React.FC<Props> = ({ segments, liveText, onSelectionChange, onClear }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [segments.length, liveText])

  const findSegmentTime = (node: Node | null) => {
    if (!node) return null
    const element = (node as HTMLElement).closest?.('[data-t0]') as HTMLElement | null
    if (!element) return null
    const t0 = Number(element.dataset.t0)
    const t1 = Number(element.dataset.t1)
    if (Number.isNaN(t0) || Number.isNaN(t1)) return null
    return { start: t0, end: t1 }
  }

  const handleSelection = () => {
    const selection = window.getSelection()
    const text = selection ? selection.toString().trim() : ''
    if (!selection || selection.rangeCount === 0 || !text) {
      onSelectionChange('', null)
      return
    }
    const anchor = findSegmentTime(selection.anchorNode)
    const focus = findSegmentTime(selection.focusNode)
    if (anchor && focus) {
      const start = Math.min(anchor.start, focus.start)
      const end = Math.max(anchor.end, focus.end)
      onSelectionChange(text, { start, end })
      return
    }
    onSelectionChange(text, null)
  }

  return (
    <section className="pane transcript" onMouseUp={handleSelection} onKeyUp={handleSelection}>
      <header>
        <div>
          <h2>Transcript</h2>
          <p>Selectable, live-updating text from system audio.</p>
        </div>
        <button className="ghost" onClick={onClear}>Clear</button>
      </header>
      <div className="transcript-body" ref={containerRef}>
        <div className="live-line">
          <span className="label">LIVE</span>
          <span className="text">{liveText || 'Waiting for audio…'}</span>
        </div>
        {segments.map((segment) => (
          <div className="segment" key={segment.id} data-t0={segment.t0} data-t1={segment.t1}>
            <span className="time">{formatTime(segment.t0)}</span>
            <span className="text">{segment.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TranscriptPane
