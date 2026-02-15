export type TranscriptSegment = {
  id: number
  t0: number
  t1: number
  text: string
  is_final: boolean
}

export type Preset = {
  id: string
  label: string
  instruction: string
}

export type QueryRequest = {
  requestId: string
  presetId: string | null
  customInstruction: string | null
  selectedText: string
  selectionTimeRange: { start: number; end: number } | null
}

export type SelectionRange = { start: number; end: number } | null
