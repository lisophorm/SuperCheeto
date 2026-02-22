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
  testId: string
  model: string
  runs: number
  failures: number
  jsonValidRuns: number
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
}

export type BenchmarkCaseInput = {
  testId: string
  userPrompt: string
  imageRef?: string | null
  imageDataUrl?: string | null
}

export type BenchmarkCaseInfo = {
  testId: string
  userPrompt: string
  imageRef?: string | null
  hasImage: boolean
}

export type BenchmarkAttempt = {
  testId: string
  model: string
  run: number
  success: boolean
  jsonValid: boolean
  latencyMs: number | null
  responsePreview: string
  error: string | null
  imageRef?: string | null
}

export type BenchmarkRun = {
  benchmarkId: string
  createdAt: number
  instruction: string
  tests: BenchmarkCaseInfo[]
  results: BenchmarkResult[]
  attempts: BenchmarkAttempt[]
}

export type BenchmarkLiveLog = BenchmarkAttempt & {
  benchmarkId: string
}

export type BenchmarkProgress = {
  completed: number
  total: number
  testId?: string
  model?: string
  run?: number
  successes?: number
  failures?: number
}

export type BenchmarkImageAsset = {
  refId: string
  dataUrl: string
  filename: string
  createdAt: number
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
