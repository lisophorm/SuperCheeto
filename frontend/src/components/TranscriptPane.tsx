import React, { useEffect, useRef, useState } from 'react'
import { AudioStreamKind, TranscriptSegment } from '../types'

type Props = {
  segments: TranscriptSegment[]
  liveText: string
  liveRows: Array<{ id: number; text: string; t: number; sourceKind: AudioStreamKind; sourceName?: string | null }>
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
  const orderedSegments = [...segments]
  const latestLiveRow = liveRows[liveRows.length - 1]
  // Respect VITE_MAX_ROWS more directly for visible rows + a LIVE row.
  const rowHeightPx = 22
  const liveRowHeightPx = 30
  const chromePx = 28
  const bodyHeightPx = Math.max(120, maxRows * rowHeightPx + liveRowHeightPx + chromePx)
  const rowClassForKind = (kind: AudioStreamKind | undefined) => (kind === 'mic' ? 'source-mic' : 'source-system')
  const rowLabelForKind = (kind: AudioStreamKind | undefined) => (kind === 'mic' ? 'MIC' : 'SYS')

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
      container.scrollTop = container.scrollHeight
    }
  }, [segments.length, liveRows.length, liveText, autoScrollPaused])

  const scrollToLatest = () => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }

  const findSelectedTimeRange = (selection: Selection) => {
    const container = containerRef.current
    if (!container || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.transcript-row[data-t0][data-t1]'))
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

  const isSelectionInsideContainer = (selection: Selection) => {
    const container = containerRef.current
    if (!container) return false
    const anchor = selection.anchorNode
    const focus = selection.focusNode
    if (!anchor || !focus) return false
    return container.contains(anchor) && container.contains(focus)
  }

  const extractSelectionText = (selection: Selection) => {
    if (selection.rangeCount === 0) {
      return ''
    }
    const range = selection.getRangeAt(0)
    const fragment = range.cloneContents()
    const wrapper = document.createElement('div')
    wrapper.appendChild(fragment)
    wrapper.querySelectorAll('.time, .label, .source-tag').forEach((element) => element.remove())
    // `textContent` does not preserve block boundaries, so selected rows can collapse.
    wrapper.querySelectorAll<HTMLElement>('.transcript-row, .live-line').forEach((row) => {
      row.appendChild(document.createTextNode(' '))
    })
    const cleaned = (wrapper.textContent || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
    if (cleaned) {
      return cleaned
    }
    return (selection.toString() || '')
      .replace(/\b\d+:\d{2}\b/g, '')
      .replace(/\bLIVE\b/g, '')
      .replace(/\b(?:SYS|MIC)\b/g, '')
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  }

  const handleSelectionChange = () => {
    const selection = window.getSelection()
    const text = selection ? extractSelectionText(selection) : ''
    // Sticky selection: keep prior selection unless user explicitly clears it.
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }
    if (!text || !isSelectionInsideContainer(selection)) {
      return
    }
    const range = findSelectedTimeRange(selection)
    if (range) {
      onSelectionChange(text, range)
      return
    }
    onSelectionChange(text, null)
  }

  const clearSelection = () => {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    onSelectionChange('', null)
  }

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [onSelectionChange])

  return (
    <section className="pane transcript">
      <header>
        <div>
          <h2>Transcript</h2>
          <p>Selectable, live-updating text from system audio or microphone.</p>
        </div>
        <div className="transcript-actions">
          <button className="ghost" onClick={() => setAutoScrollPaused((prev) => !prev)}>
            {autoScrollPaused ? 'Resume Auto Scroll' : 'Pause Auto Scroll'}
          </button>
          <button className="ghost" onClick={scrollToLatest}>Scroll to Latest</button>
          <button className="ghost" onClick={clearSelection}>Clear Selection</button>
          <button className="ghost" onClick={onClear}>Clear</button>
        </div>
      </header>
      <div
        className="transcript-body"
        ref={containerRef}
        style={{ height: `${bodyHeightPx}px`, maxHeight: `${bodyHeightPx}px` }}
      >
        {orderedSegments.map((segment, idx) => (
          <div
            className={`segment transcript-row ${rowClassForKind(segment.source_kind)}`}
            key={`seg-${segment.id}-${segment.t0.toFixed(2)}-${segment.t1.toFixed(2)}-${idx}`}
            data-t0={segment.t0}
            data-t1={segment.t1}
          >
            <span className="time">{formatTime(segment.t0)}</span>
            <span className="source-tag">{rowLabelForKind(segment.source_kind)}</span>
            <span className="text">{segment.text}</span>
          </div>
        ))}
        {!latestLiveRow ? (
          <div className="live-line source-system">
            <span className="label">LIVE</span>
            <span className="text">{liveText || 'Waiting for audio…'}</span>
          </div>
        ) : (
          <div
            className={`live-line transcript-row ${rowClassForKind(latestLiveRow.sourceKind)}`}
            data-t0={latestLiveRow.t}
            data-t1={latestLiveRow.t}
          >
            <span className="label">LIVE</span>
            <span className="source-tag">{rowLabelForKind(latestLiveRow.sourceKind)}</span>
            <span className="text">{latestLiveRow.text}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export default TranscriptPane
