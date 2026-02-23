type WSHandlers = {
  onStatus: (payload: { state: string; details?: string }) => void
  onLive: (payload: { text: string; t: number; streamKind?: 'system' | 'mic'; sourceName?: string | null }) => void
  onSegment: (payload: { segment: any }) => void
  onAudioLevel: (payload: {
    rms: number
    peak?: number
    level: number
    t: number
    streamKind?: 'system' | 'mic'
    sourceName?: string | null
  }) => void
  onAudioSources: (payload: {
    sources: string[]
    defaultSource?: string
    selectedSource?: string
    monitorSources?: string[]
    defaultMonitorSource?: string
    selectedMonitorSource?: string
    micSources?: string[]
    defaultMicSource?: string
    selectedMicSource?: string
    selectedMode?: 'system' | 'mic'
  }) => void
  onModelsList: (payload: { models: string[]; selectedModel?: string }) => void
  onModelsDetails: (payload: { models: Array<{ id: string; object: string; created: number | null; owned_by: string }> }) => void
  onQueryState: (payload: { running: boolean; requestId?: string; cancelled?: boolean }) => void
  onQueryChunk: (payload: { requestId?: string; delta?: string }) => void
  onQueryResponse: (payload: { requestId?: string; text: string; latencyMs?: number; model?: string; screenshotUsed?: boolean }) => void
  onBenchmarkProgress: (payload: {
    benchmarkId?: string
    completed: number
    total: number
    testId?: string
    model?: string
    run?: number
    successes?: number
    failures?: number
  }) => void
  onBenchmarkLog: (payload: {
    benchmarkId?: string
    testId?: string
    model?: string
    run?: number
    success?: boolean
    jsonValid?: boolean
    timeToFirstTokenMs?: number | null
    ttcMs?: number | null
    latencyMs?: number | null
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    costUsd?: number | null
    qualityScore?: number
    qualityPassed?: boolean
    qualityChecks?: Array<{ name: string; passed: boolean; details: string }>
    imageCapabilityClaim?: string | null
    imageWorked?: boolean | null
    responsePreview?: string
    error?: string | null
    imageRef?: string | null
  }) => void
  onBenchmarkComplete: (payload: {
    benchmarkId?: string
    createdAt?: number
    instruction?: string
    tests?: any[]
    results: any[]
    attempts?: any[]
  }) => void
  onError: (payload: { message: string }) => void
}

export class WSClient {
  private socket: WebSocket | null = null
  private retry = 0
  private readonly url: string
  private readonly handlers: WSHandlers

  constructor(url: string, handlers: WSHandlers) {
    this.url = url
    this.handlers = handlers
  }

  connect() {
    this.socket = new WebSocket(this.url)
    this.socket.onopen = () => {
      this.retry = 0
      this.handlers.onStatus({ state: 'connected' })
    }
    this.socket.onclose = () => {
      this.handlers.onStatus({ state: 'disconnected' })
      this.scheduleReconnect()
    }
    this.socket.onerror = () => {
      this.handlers.onError({ message: 'WebSocket error' })
    }
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        switch (data.type) {
          case 'status':
            this.handlers.onStatus(data)
            break
          case 'transcript_live':
            this.handlers.onLive(data)
            break
          case 'transcript_segment':
            this.handlers.onSegment(data)
            break
          case 'audio_level':
            this.handlers.onAudioLevel(data)
            break
          case 'audio_sources':
            this.handlers.onAudioSources(data)
            break
          case 'models_list':
            this.handlers.onModelsList(data)
            break
          case 'models_details':
            this.handlers.onModelsDetails(data)
            break
          case 'query_state':
            this.handlers.onQueryState(data)
            break
          case 'query_chunk':
            this.handlers.onQueryChunk(data)
            break
          case 'query_response':
            this.handlers.onQueryResponse(data)
            break
          case 'benchmark_progress':
            this.handlers.onBenchmarkProgress(data)
            break
          case 'benchmark_log':
            this.handlers.onBenchmarkLog(data)
            break
          case 'benchmark_complete':
            this.handlers.onBenchmarkComplete(data)
            break
          case 'error':
            this.handlers.onError(data)
            break
          default:
            break
        }
      } catch {
        this.handlers.onError({ message: 'Malformed message from backend.' })
      }
    }
  }

  send(message: Record<string, unknown>) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private scheduleReconnect() {
    this.retry += 1
    const delay = Math.min(5000, 500 + this.retry * 500)
    setTimeout(() => this.connect(), delay)
  }
}
