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

export type OpenAIModelInfo = {
  id: string
  object: string
  created: number | null
  owned_by: string
}

export type BenchmarkResult = {
  model: string
  runs: number
  failures: number
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
}

export type QueryRequest = {
  requestId: string
  presetId: string | null
  customInstruction: string | null
  selectedText: string
  selectionTimeRange: { start: number; end: number } | null
  model?: string | null
}

export type SelectionRange = { start: number; end: number } | null
