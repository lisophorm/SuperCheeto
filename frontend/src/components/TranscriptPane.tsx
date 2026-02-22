import React, { useEffect, useRef, useState } from 'react'
import { TranscriptSegment } from '../types'

type Props = {
  segments: TranscriptSegment[]
  liveText: string
  liveRows: Array<{ id: number; text: string; t: number }>
  maxRows: number
  onSelectionChange: (text: string, range: { start: number; end: number } | null) => void
  onClear: () => void
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const TranscriptPane: React.FC<Props> = ({ segments, liveText, liveRows, maxRows, onSelectionChange, onClear }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [autoScrollPaused, setAutoScrollPaused] = useState(false)
  const orderedSegments = [...segments].reverse()
  const latestLiveRow = liveRows[0]
  const olderLiveRows = liveRows.slice(1)
  const maxBodyHeight = Math.max(280, maxRows * 42 + 72)

  useEffect(() => {
    if (autoScrollPaused) {
      return
    }
    const container = containerRef.current
    if (container) {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) {
        return
      }
      container.scrollTop = 0
    }
  }, [segments.length, liveText, autoScrollPaused])

  const scrollToTop = () => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = 0
  }

  const findSelectedTimeRange = (selection: Selection) => {
    const container = containerRef.current
    if (!container || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.segment[data-t0][data-t1]'))
    const intersectingRows = rows.filter((row) => {
      try {
        return range.intersectsNode(row)
      } catch {
        return false
      }
    })
    if (intersectingRows.length === 0) return null
    let start = Number.POSITIVE_INFINITY
    let end = Number.NEGATIVE_INFINITY
    for (const row of intersectingRows) {
      const t0 = Number(row.dataset.t0)
      const t1 = Number(row.dataset.t1)
      if (Number.isNaN(t0) || Number.isNaN(t1)) continue
      start = Math.min(start, t0)
      end = Math.max(end, t1)
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null
    }
    return { start, end }
  }

  const handleSelection = () => {
    const selection = window.getSelection()
    const text = selection ? selection.toString().trim() : ''
    if (!selection || selection.rangeCount === 0 || !text) {
      onSelectionChange('', null)
      return
    }
    const range = findSelectedTimeRange(selection)
    if (range) {
      onSelectionChange(text, range)
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
        <div className="transcript-actions">
          <button className="ghost" onClick={() => setAutoScrollPaused((prev) => !prev)}>
            {autoScrollPaused ? 'Resume Auto Scroll' : 'Pause Auto Scroll'}
          </button>
          <button className="ghost" onClick={scrollToTop}>Scroll to Top</button>
          <button className="ghost" onClick={onClear}>Clear</button>
        </div>
      </header>
      <div className="transcript-body" ref={containerRef} style={{ maxHeight: `${maxBodyHeight}px` }}>
        {!latestLiveRow ? (
          <div className="live-line">
            <span className="label">LIVE</span>
            <span className="text">{liveText || 'Waiting for audio…'}</span>
          </div>
        ) : (
          <div className="live-line">
            <span className="label">LIVE</span>
            <span className="text">{latestLiveRow.text}</span>
          </div>
        )}
        {olderLiveRows.map((row) => (
          <div className="segment" key={`live-${row.id}`} data-t0={row.t} data-t1={row.t}>
            <span className="time">{formatTime(row.t)}</span>
            <span className="text">{row.text}</span>
          </div>
        ))}
        {orderedSegments.map((segment, idx) => (
          <div
            className="segment"
            key={`seg-${segment.id}-${segment.t0.toFixed(2)}-${segment.t1.toFixed(2)}-${idx}`}
            data-t0={segment.t0}
            data-t1={segment.t1}
          >
            <span className="time">{formatTime(segment.t0)}</span>
            <span className="text">{segment.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TranscriptPane
