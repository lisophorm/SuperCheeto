import React, { useEffect, useMemo, useRef, useState } from 'react'
import PromptBar from './components/PromptBar'
import TranscriptPane from './components/TranscriptPane'
import OutputPane from './components/OutputPane'
import SettingsPage from './components/SettingsPage'
import {
  AudioStreamKind,
  BenchmarkCaseInput,
  BenchmarkImageAsset,
  BenchmarkLiveLog,
  BenchmarkProgress,
  BenchmarkRun,
  OpenAIModelInfo,
  Preset,
  SelectionRange,
  TranscriptSegment
} from './types'
import { WSClient } from './ws'

const PRESETS: Preset[] = [
  {
    id: 'fact_check',
    label: 'Fact check (no browsing)',
    instruction: 'Identify claims that may be wrong; explain uncertainty; suggest what to verify.'
  },
  {
    id: 'answer_question',
    label: 'Answer the question',
    instruction: 'Answer clearly and concisely.'
  },
  {
    id: 'write_js',
    label: 'Write JavaScript code',
    instruction: 'Write JavaScript code to satisfy the request; include edge cases.'
  },
  {
    id: 'action_items',
    label: 'Extract action items',
    instruction: 'List action items with any owners/dates mentioned.'
  }
]

const parseMaxRows = () => {
  const raw = Number(import.meta.env.VITE_MAX_ROWS)
  if (!Number.isFinite(raw) || raw <= 0) return 30
  return Math.floor(raw)
}

const parseSelectedTextRowsCollapsed = () => {
  const raw = Number(import.meta.env.VITE_SELECTED_TEXT_ROWS_COLLAPSED)
  if (!Number.isFinite(raw) || raw <= 0) return 2
  return Math.max(1, Math.min(20, Math.floor(raw)))
}

const parseSelectedTextRowsFocused = (collapsedRows: number) => {
  const raw = Number(import.meta.env.VITE_SELECTED_TEXT_ROWS_FOCUSED)
  if (!Number.isFinite(raw) || raw <= 0) return Math.max(10, collapsedRows)
  return Math.max(collapsedRows, Math.min(30, Math.floor(raw)))
}

const BENCHMARK_HISTORY_STORAGE_KEY = 'benchmark-history.v1'
const BENCHMARK_IMAGES_STORAGE_KEY = 'benchmark-images.v1'
const MAX_BENCHMARK_HISTORY = 40
const MAX_BENCHMARK_LIVE_LOGS = 500

const speedScoreFromMs = (valueMs: number | null | undefined, pivotMs: number): number => {
  if (valueMs === null || valueMs === undefined || !Number.isFinite(valueMs) || valueMs <= 0) {
    return 0
  }
  return 1 / (1 + (valueMs / pivotMs))
}

const fallbackAggregateScore = (row: any): number => {
  const runs = Number.isFinite(row?.runs) ? Number(row.runs) : 0
  const failures = Number.isFinite(row?.failures) ? Number(row.failures) : 0
  const jsonValidRuns = Number.isFinite(row?.jsonValidRuns) ? Number(row.jsonValidRuns) : 0
  const imageRuns = Number.isFinite(row?.imageRuns) ? Number(row.imageRuns) : 0
  const imageWorkedRuns = Number.isFinite(row?.imageWorkedRuns) ? Number(row.imageWorkedRuns) : 0
  const avgTtcMs =
    (typeof row?.avgTtcMs === 'number' && Number.isFinite(row.avgTtcMs))
      ? row.avgTtcMs
      : (typeof row?.avgLatencyMs === 'number' && Number.isFinite(row.avgLatencyMs))
        ? row.avgLatencyMs
        : null
  const avgFirstTokenMs =
    (typeof row?.avgFirstTokenMs === 'number' && Number.isFinite(row.avgFirstTokenMs))
      ? row.avgFirstTokenMs
      : null
  const avgQualityScore =
    (typeof row?.avgQualityScore === 'number' && Number.isFinite(row.avgQualityScore))
      ? row.avgQualityScore
      : 0

  const totalAttempts = runs + failures
  const successRate = totalAttempts > 0 ? runs / totalAttempts : 0
  const jsonRate = runs > 0 ? jsonValidRuns / runs : 0
  const qualityRate = Math.max(0, Math.min(1, avgQualityScore))
  const imageRate = imageRuns > 0 ? imageWorkedRuns / imageRuns : 1

  const ttcScore = speedScoreFromMs(avgTtcMs, 900)
  const ttftScore = speedScoreFromMs(avgFirstTokenMs, 260)
  const speedScore = (0.84 * ttcScore) + (0.16 * ttftScore)
  const reliabilityScore = (0.72 * successRate) + (0.28 * jsonRate)
  const qualityScore = (0.75 * qualityRate) + (0.25 * imageRate)
  const raw = (0.82 * speedScore) + (0.13 * reliabilityScore) + (0.05 * qualityScore)
  const penalty = 0.20 + (0.80 * successRate)
  const finalScore = Math.max(0, Math.min(1, raw * penalty)) * 100
  return Number(finalScore.toFixed(2))
}

const normalizeBenchmarkHistory = (history: BenchmarkRun[]): BenchmarkRun[] => {
  const seenBenchmarkIds = new Set<string>()
  const normalized: BenchmarkRun[] = []

  for (const run of history) {
    if (!run || typeof run !== 'object') {
      continue
    }
    const benchmarkId = typeof run.benchmarkId === 'string' ? run.benchmarkId.trim() : ''
    if (benchmarkId && seenBenchmarkIds.has(benchmarkId)) {
      continue
    }
    if (benchmarkId) {
      seenBenchmarkIds.add(benchmarkId)
    }
    normalized.push(run)
  }

  return normalized.slice(0, MAX_BENCHMARK_HISTORY)
}

const loadBenchmarkHistory = (): BenchmarkRun[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BENCHMARK_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeBenchmarkHistory(parsed as BenchmarkRun[])
  } catch {
    return []
  }
}

const loadBenchmarkImages = (): BenchmarkImageAsset[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BENCHMARK_IMAGES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as BenchmarkImageAsset[]
  } catch {
    return []
  }
}

type LiveRow = {
  id: number
  text: string
  t: number
  sourceKind: AudioStreamKind
  sourceName?: string | null
}

type QueryRunPayload = {
  presetId: string | null
  customInstruction: string | null
  selectedText: string
  selectionTimeRange: SelectionRange
  model: string | null
  includeScreenshot: boolean
  screenshotDataUrl: string | null
}

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<'desk' | 'settings'>('desk')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [liveText, setLiveText] = useState('')
  const [liveRows, setLiveRows] = useState<LiveRow[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [selectedTextDraft, setSelectedTextDraft] = useState('')
  const [selectionRange, setSelectionRange] = useState<SelectionRange>(null)
  const [output, setOutput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const [isRunning, setIsRunning] = useState(false)
  const [audioMode, setAudioMode] = useState<AudioStreamKind>('system')
  const [systemAudioLevel, setSystemAudioLevel] = useState(0)
  const [systemAudioRms, setSystemAudioRms] = useState(0)
  const [systemAudioSources, setSystemAudioSources] = useState<string[]>([])
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = useState('')
  const [micAudioLevel, setMicAudioLevel] = useState(0)
  const [micAudioRms, setMicAudioRms] = useState(0)
  const [micAudioSources, setMicAudioSources] = useState<string[]>([])
  const [selectedMicAudioSource, setSelectedMicAudioSource] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [modelDetails, setModelDetails] = useState<OpenAIModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [includeScreenshotInQuery, setIncludeScreenshotInQuery] = useState(false)
  const [lastQueryLatencyMs, setLastQueryLatencyMs] = useState<number | null>(null)
  const [lastResponseModel, setLastResponseModel] = useState<string>('')
  const [lastScreenshotUsed, setLastScreenshotUsed] = useState(false)
  const [activeQueryRequestId, setActiveQueryRequestId] = useState<string | null>(null)
  const [lastQueryPayload, setLastQueryPayload] = useState<QueryRunPayload | null>(null)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [benchmarkProgress, setBenchmarkProgress] = useState<BenchmarkProgress | null>(null)
  const [activeBenchmarkId, setActiveBenchmarkId] = useState<string | null>(null)
  const [benchmarkLiveLogs, setBenchmarkLiveLogs] = useState<BenchmarkLiveLog[]>([])
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRun[]>(() => loadBenchmarkHistory())
  const [benchmarkImages, setBenchmarkImages] = useState<BenchmarkImageAsset[]>(() => loadBenchmarkImages())
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id)
  const activeBenchmarkIdRef = useRef<string | null>(null)
  const activeQueryRequestIdRef = useRef<string | null>(null)
  const maxRows = parseMaxRows()
  const selectedTextRowsCollapsed = parseSelectedTextRowsCollapsed()
  const selectedTextRowsFocused = parseSelectedTextRowsFocused(selectedTextRowsCollapsed)
  const canResetSelectedTextDraft = selectedTextDraft !== selectedText

  const client = useMemo(() => {
    return new WSClient('ws://127.0.0.1:8765', {
      onStatus: (payload) => {
        if (payload.details) {
          setStatus(`${payload.state}: ${payload.details}`)
        } else {
          setStatus(payload.state)
        }
        if (payload.state === 'transcribing') {
          setIsRunning(true)
        } else if (payload.state === 'stopped') {
          setIsRunning(false)
        }
        if (payload.state === 'connected') {
          client.send({ type: 'get_audio_sources' })
          client.send({ type: 'get_models' })
          client.send({ type: 'get_model_details' })
        }
      },
      onLive: (payload) => {
        setLiveText(payload.text)
        const text = (payload.text || '').trim()
        if (!text) {
          return
        }
        const sourceKind: AudioStreamKind = payload.streamKind === 'mic' ? 'mic' : 'system'
        setLiveRows((prev) => {
          const lastRow = prev[prev.length - 1]
          if (lastRow?.text === text && lastRow.sourceKind === sourceKind) {
            return prev
          }
          const next: LiveRow = { id: Date.now(), text, t: payload.t, sourceKind, sourceName: payload.sourceName || null }
          return [...prev, next].slice(-50)
        })
      },
      onSegment: (payload) => {
        setSegments((prev) => [...prev, payload.segment])
      },
      onAudioLevel: (payload) => {
        const streamKind: AudioStreamKind = payload.streamKind === 'mic' ? 'mic' : 'system'
        if (streamKind === 'mic') {
          setMicAudioLevel(payload.level)
          setMicAudioRms(payload.rms)
          return
        }
        setSystemAudioLevel(payload.level)
        setSystemAudioRms(payload.rms)
      },
      onAudioSources: (payload) => {
        const monitorSources = payload.monitorSources || payload.sources || []
        const micSources = payload.micSources || []
        setSystemAudioSources(monitorSources)
        setMicAudioSources(micSources)
        if (payload.selectedMode) {
          setAudioMode(payload.selectedMode)
        }
        if (payload.selectedMonitorSource) {
          setSelectedSystemAudioSource(payload.selectedMonitorSource)
        } else if (payload.selectedSource) {
          setSelectedSystemAudioSource(payload.selectedSource)
        } else if (payload.defaultMonitorSource) {
          setSelectedSystemAudioSource(payload.defaultMonitorSource)
        } else if (payload.defaultSource) {
          setSelectedSystemAudioSource(payload.defaultSource)
        } else if (monitorSources.length > 0) {
          setSelectedSystemAudioSource(monitorSources[0])
        }
        if (payload.selectedMicSource) {
          setSelectedMicAudioSource(payload.selectedMicSource)
        } else if (payload.defaultMicSource) {
          setSelectedMicAudioSource(payload.defaultMicSource)
        } else if (micSources.length > 0) {
          setSelectedMicAudioSource(micSources[0])
        }
      },
      onModelsList: (payload) => {
        setModels(payload.models || [])
        if (payload.selectedModel) {
          setSelectedModel(payload.selectedModel)
        } else if ((payload.models || []).length > 0 && !selectedModel) {
          setSelectedModel(payload.models[0])
        }
      },
      onModelsDetails: (payload) => {
        setModelDetails(payload.models || [])
      },
      onQueryState: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (payload.running) {
          setIsQuerying(true)
          if (requestId) {
            activeQueryRequestIdRef.current = requestId
            setActiveQueryRequestId(requestId)
          }
          return
        }
        if (requestId && activeQueryRequestIdRef.current && requestId !== activeQueryRequestIdRef.current) {
          return
        }
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
      },
      onQueryChunk: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (!requestId || requestId !== activeQueryRequestIdRef.current) {
          return
        }
        const delta = payload.delta || ''
        if (!delta) {
          return
        }
        setOutput((prev) => prev + delta)
      },
      onQueryResponse: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (requestId && activeQueryRequestIdRef.current && requestId !== activeQueryRequestIdRef.current) {
          return
        }
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
        setOutput(payload.text)
        setLastQueryLatencyMs(typeof payload.latencyMs === 'number' ? payload.latencyMs : null)
        setLastResponseModel(payload.model || '')
        setLastScreenshotUsed(Boolean(payload.screenshotUsed))
      },
      onBenchmarkProgress: (payload) => {
        setBenchmarkRunning(true)
        setBenchmarkProgress({
          completed: payload.completed,
          total: payload.total,
          testId: payload.testId,
          model: payload.model,
          run: payload.run,
          successes: payload.successes,
          failures: payload.failures
        })
      },
      onBenchmarkLog: (payload) => {
        const currentBenchmarkId = activeBenchmarkIdRef.current
        const benchmarkId = payload.benchmarkId || currentBenchmarkId
        if (!benchmarkId || (currentBenchmarkId && benchmarkId !== currentBenchmarkId)) {
          return
        }
        const row: BenchmarkLiveLog = {
          benchmarkId,
          testId: payload.testId || '',
          model: payload.model || '',
          run: payload.run || 0,
          success: Boolean(payload.success),
          jsonValid: Boolean(payload.jsonValid),
          timeToFirstTokenMs: typeof payload.timeToFirstTokenMs === 'number' ? payload.timeToFirstTokenMs : null,
          ttcMs:
            typeof payload.ttcMs === 'number'
              ? payload.ttcMs
              : typeof payload.latencyMs === 'number'
                ? payload.latencyMs
                : null,
          latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
          inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : null,
          outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : null,
          totalTokens: typeof payload.totalTokens === 'number' ? payload.totalTokens : null,
          costUsd: typeof payload.costUsd === 'number' ? payload.costUsd : null,
          qualityScore: typeof payload.qualityScore === 'number' ? payload.qualityScore : 0,
          qualityPassed: Boolean(payload.qualityPassed),
          qualityChecks: Array.isArray(payload.qualityChecks) ? payload.qualityChecks : [],
          imageCapabilityClaim: payload.imageCapabilityClaim || null,
          imageWorked: typeof payload.imageWorked === 'boolean' ? payload.imageWorked : null,
          responsePreview: payload.responsePreview || '',
          error: payload.error || null,
          imageRef: payload.imageRef || null
        }
        setBenchmarkLiveLogs((prev) => [row, ...prev].slice(0, MAX_BENCHMARK_LIVE_LOGS))
      },
      onBenchmarkComplete: (payload) => {
        setBenchmarkRunning(false)
        setBenchmarkProgress(null)
        setActiveBenchmarkId(null)
        activeBenchmarkIdRef.current = null
        const run: BenchmarkRun = {
          benchmarkId: payload.benchmarkId || crypto.randomUUID(),
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Math.floor(Date.now() / 1000),
          instruction: payload.instruction || '',
          tests: Array.isArray(payload.tests) ? payload.tests : [],
          results: Array.isArray(payload.results)
            ? payload.results.map((row: any) => {
                const avgTtcMs = typeof row.avgTtcMs === 'number'
                  ? row.avgTtcMs
                  : typeof row.avgLatencyMs === 'number'
                    ? row.avgLatencyMs
                    : null
                const minTtcMs = typeof row.minTtcMs === 'number'
                  ? row.minTtcMs
                  : typeof row.minLatencyMs === 'number'
                    ? row.minLatencyMs
                    : null
                const maxTtcMs = typeof row.maxTtcMs === 'number'
                  ? row.maxTtcMs
                  : typeof row.maxLatencyMs === 'number'
                    ? row.maxLatencyMs
                    : null
                return {
                  ...row,
                  avgTtcMs,
                  minTtcMs,
                  maxTtcMs,
                  aggregateScore:
                    typeof row.aggregateScore === 'number' && Number.isFinite(row.aggregateScore)
                      ? row.aggregateScore
                      : fallbackAggregateScore(row)
                }
              })
            : [],
          attempts: Array.isArray(payload.attempts) ? payload.attempts : []
        }
        setBenchmarkHistory((prev) => normalizeBenchmarkHistory([run, ...prev]))
      },
      onError: (payload) => {
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
        setBenchmarkRunning(false)
        setBenchmarkProgress(null)
        setActiveBenchmarkId(null)
        activeBenchmarkIdRef.current = null
        setStatus(`error: ${payload.message}`)
      }
    })
  }, [])

  useEffect(() => {
    client.connect()
  }, [client])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BENCHMARK_HISTORY_STORAGE_KEY, JSON.stringify(benchmarkHistory))
  }, [benchmarkHistory])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BENCHMARK_IMAGES_STORAGE_KEY, JSON.stringify(benchmarkImages))
  }, [benchmarkImages])

  const canRun = selectedTextDraft.trim().length > 0

  const executeQuery = (query: QueryRunPayload) => {
    if (!query.selectedText.trim()) {
      return
    }
    const requestId = crypto.randomUUID()
    setLastQueryPayload(query)
    setIsQuerying(true)
    setOutput('')
    setLastQueryLatencyMs(null)
    setLastResponseModel(query.model || '')
    setLastScreenshotUsed(Boolean(query.includeScreenshot && query.screenshotDataUrl))
    setActiveQueryRequestId(requestId)
    activeQueryRequestIdRef.current = requestId
    client.send({
      type: 'run_query',
      requestId,
      presetId: query.presetId,
      customInstruction: query.customInstruction,
      selectedText: query.selectedText,
      selectionTimeRange: query.selectionTimeRange,
      model: query.model,
      includeScreenshot: query.includeScreenshot,
      screenshotDataUrl: query.screenshotDataUrl
    })
  }

  const runPreset = () => {
    const trimmedSelection = selectedText.trim()
    const trimmedDraft = selectedTextDraft.trim()
    executeQuery({
      presetId: selectedPresetId,
      customInstruction: null,
      selectedText: selectedTextDraft,
      selectionTimeRange: trimmedDraft && trimmedDraft === trimmedSelection ? selectionRange : null,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const runCustom = () => {
    const trimmedSelection = selectedText.trim()
    const trimmedDraft = selectedTextDraft.trim()
    executeQuery({
      presetId: null,
      customInstruction: customInstruction.trim(),
      selectedText: selectedTextDraft,
      selectionTimeRange: trimmedDraft && trimmedDraft === trimmedSelection ? selectionRange : null,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const stopQuery = () => {
    if (!activeQueryRequestIdRef.current) {
      return
    }
    client.send({ type: 'cancel_query', requestId: activeQueryRequestIdRef.current })
  }

  const runLastQueryAgain = () => {
    if (!lastQueryPayload || isQuerying) {
      return
    }
    executeQuery(lastQueryPayload)
  }

  const startTranscription = () => {
    client.send({ type: 'set_audio_mode', mode: audioMode })
    if (selectedSystemAudioSource) {
      client.send({ type: 'set_audio_source', sourceName: selectedSystemAudioSource })
    }
    if (selectedMicAudioSource) {
      client.send({ type: 'set_mic_source', sourceName: selectedMicAudioSource })
    }
    client.send({ type: 'start_transcription' })
  }

  const stopTranscription = () => {
    client.send({ type: 'stop_transcription' })
    setSystemAudioLevel(0)
    setSystemAudioRms(0)
    setMicAudioLevel(0)
    setMicAudioRms(0)
  }

  const clearTranscript = () => {
    setSegments([])
    setLiveText('')
    setLiveRows([])
    setSelectedText('')
    setSelectedTextDraft('')
    setSelectionRange(null)
    client.send({ type: 'clear_transcript' })
  }

  const refreshAudioSources = () => {
    client.send({ type: 'get_audio_sources' })
  }

  const changeSystemAudioSource = (sourceName: string) => {
    setSelectedSystemAudioSource(sourceName)
    client.send({ type: 'set_audio_source', sourceName })
  }

  const changeMicAudioSource = (sourceName: string) => {
    setSelectedMicAudioSource(sourceName)
    client.send({ type: 'set_mic_source', sourceName })
  }

  const changeAudioMode = (mode: AudioStreamKind) => {
    setAudioMode(mode)
    setSystemAudioLevel(0)
    setSystemAudioRms(0)
    setMicAudioLevel(0)
    setMicAudioRms(0)
    client.send({ type: 'set_audio_mode', mode })
  }

  const captureScreen = async () => {
    try {
      const dataUrl = await window.electronAPI?.captureScreen?.()
      if (dataUrl) {
        setScreenshotDataUrl(dataUrl)
      } else {
        setStatus('error: screen capture returned no image')
      }
    } catch (err) {
      setStatus(`error: failed to capture screen: ${String(err)}`)
    }
  }

  const runBenchmark = (payload: { models: string[]; instruction: string; tests: BenchmarkCaseInput[]; repeats: number }) => {
    const benchmarkId = crypto.randomUUID()
    const imageByRef = new Map(benchmarkImages.map((image) => [image.refId, image.dataUrl]))
    const tests = payload.tests.map((test) => ({
      testId: test.testId,
      userPrompt: test.userPrompt,
      imageRef: test.imageRef || null,
      imageDataUrl: test.imageRef ? imageByRef.get(test.imageRef) || null : null
    }))
    setBenchmarkRunning(true)
    setActiveBenchmarkId(benchmarkId)
    activeBenchmarkIdRef.current = benchmarkId
    setBenchmarkLiveLogs([])
    setBenchmarkProgress({ completed: 0, total: payload.models.length * payload.repeats * tests.length })
    client.send({
      type: 'run_benchmark',
      benchmarkId,
      models: payload.models,
      instruction: payload.instruction,
      tests,
      repeats: payload.repeats
    })
  }

  return (
    <div className="app">
      <section className="page-tabs">
        <button className={activePage === 'desk' ? 'primary' : 'ghost'} onClick={() => setActivePage('desk')}>Desk</button>
        <button className={activePage === 'settings' ? 'primary' : 'ghost'} onClick={() => setActivePage('settings')}>Settings</button>
      </section>

      {activePage === 'desk' ? (
        <>
          <PromptBar
            presets={PRESETS}
            selectedPresetId={selectedPresetId}
            onPresetChange={setSelectedPresetId}
            customInstruction={customInstruction}
            onCustomInstructionChange={setCustomInstruction}
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onCaptureScreen={captureScreen}
            onRunPreset={runPreset}
            onRunCustom={runCustom}
            canRun={canRun}
            isQuerying={isQuerying}
            status={status}
            isRunning={isRunning}
            audioMode={audioMode}
            onAudioModeChange={changeAudioMode}
            systemAudioLevel={systemAudioLevel}
            systemAudioRms={systemAudioRms}
            systemAudioSources={systemAudioSources}
            selectedSystemAudioSource={selectedSystemAudioSource}
            onSystemAudioSourceChange={changeSystemAudioSource}
            micAudioLevel={micAudioLevel}
            micAudioRms={micAudioRms}
            micAudioSources={micAudioSources}
            selectedMicAudioSource={selectedMicAudioSource}
            onMicAudioSourceChange={changeMicAudioSource}
            onRefreshAudioSources={refreshAudioSources}
            onStart={startTranscription}
            onStop={stopTranscription}
          />

          <div className="content">
            <TranscriptPane
              segments={segments}
              liveText={liveText}
              liveRows={liveRows}
              maxRows={maxRows}
              onSelectionChange={(text, range) => {
                setSelectedText(text)
                setSelectedTextDraft(text)
                setSelectionRange(range)
              }}
              onClear={clearTranscript}
            />
            <OutputPane
              output={output}
              isQuerying={isQuerying}
              canStopQuery={Boolean(activeQueryRequestId)}
              canRunAgain={Boolean(lastQueryPayload)}
              onStopQuery={stopQuery}
              onRunAgain={runLastQueryAgain}
              screenshotDataUrl={screenshotDataUrl}
              onClearScreenshot={() => setScreenshotDataUrl(null)}
              latencyMs={lastQueryLatencyMs}
              model={lastResponseModel}
              screenshotUsed={lastScreenshotUsed}
              selectedTextDraft={selectedTextDraft}
              onSelectedTextDraftChange={setSelectedTextDraft}
              onResetSelectedTextDraft={() => setSelectedTextDraft(selectedText)}
              canResetSelectedTextDraft={canResetSelectedTextDraft}
              collapsedRows={selectedTextRowsCollapsed}
              focusedRows={selectedTextRowsFocused}
            />
          </div>

          <section className="selection">
            <div>
              <h3>Selected text</h3>
              <p className={selectedText ? 'selected' : 'muted'}>
                {selectedText || 'Select any portion of the transcript to enable prompts.'}
              </p>
            </div>
          </section>
        </>
      ) : (
        <SettingsPage
          models={models}
          modelDetails={modelDetails}
          includeScreenshotInQuery={includeScreenshotInQuery}
          onToggleIncludeScreenshot={setIncludeScreenshotInQuery}
          onRefreshModelDetails={() => client.send({ type: 'get_model_details' })}
          onRunBenchmark={runBenchmark}
          benchmarkRunning={benchmarkRunning}
          benchmarkProgress={benchmarkProgress}
          benchmarkLiveLogs={benchmarkLiveLogs}
          benchmarkHistory={benchmarkHistory}
          benchmarkImages={benchmarkImages}
          onUpsertBenchmarkImage={(image) => {
            setBenchmarkImages((prev) => {
              const next = prev.filter((item) => item.refId !== image.refId)
              return [image, ...next].sort((a, b) => a.refId.localeCompare(b.refId))
            })
          }}
          onDeleteBenchmarkImage={(refId) =>
            setBenchmarkImages((prev) => prev.filter((item) => item.refId !== refId))
          }
          onClearBenchmarkHistory={() => setBenchmarkHistory([])}
        />
      )}
    </div>
  )
}

export default App
