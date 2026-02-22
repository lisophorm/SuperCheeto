import React, { useEffect, useMemo, useRef, useState } from 'react'
import PromptBar from './components/PromptBar'
import TranscriptPane from './components/TranscriptPane'
import OutputPane from './components/OutputPane'
import SettingsPage from './components/SettingsPage'
import {
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

const BENCHMARK_HISTORY_STORAGE_KEY = 'benchmark-history.v1'
const BENCHMARK_IMAGES_STORAGE_KEY = 'benchmark-images.v1'
const MAX_BENCHMARK_HISTORY = 40
const MAX_BENCHMARK_LIVE_LOGS = 500

const loadBenchmarkHistory = (): BenchmarkRun[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BENCHMARK_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as BenchmarkRun[]
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
}

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<'desk' | 'settings'>('desk')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [liveText, setLiveText] = useState('')
  const [liveRows, setLiveRows] = useState<LiveRow[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState<SelectionRange>(null)
  const [output, setOutput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const [isRunning, setIsRunning] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioRms, setAudioRms] = useState(0)
  const [audioSources, setAudioSources] = useState<string[]>([])
  const [selectedAudioSource, setSelectedAudioSource] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [modelDetails, setModelDetails] = useState<OpenAIModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [includeScreenshotInQuery, setIncludeScreenshotInQuery] = useState(false)
  const [lastQueryLatencyMs, setLastQueryLatencyMs] = useState<number | null>(null)
  const [lastResponseModel, setLastResponseModel] = useState<string>('')
  const [lastScreenshotUsed, setLastScreenshotUsed] = useState(false)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [benchmarkProgress, setBenchmarkProgress] = useState<BenchmarkProgress | null>(null)
  const [activeBenchmarkId, setActiveBenchmarkId] = useState<string | null>(null)
  const [benchmarkLiveLogs, setBenchmarkLiveLogs] = useState<BenchmarkLiveLog[]>([])
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRun[]>(() => loadBenchmarkHistory())
  const [benchmarkImages, setBenchmarkImages] = useState<BenchmarkImageAsset[]>(() => loadBenchmarkImages())
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id)
  const activeBenchmarkIdRef = useRef<string | null>(null)
  const maxRows = parseMaxRows()

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
        setLiveRows((prev) => {
          if (prev[0]?.text === text) {
            return prev
          }
          const next: LiveRow = { id: Date.now(), text, t: payload.t }
          return [next, ...prev].slice(0, 50)
        })
      },
      onSegment: (payload) => {
        setSegments((prev) => [...prev, payload.segment])
      },
      onAudioLevel: (payload) => {
        setAudioLevel(payload.level)
        setAudioRms(payload.rms)
      },
      onAudioSources: (payload) => {
        setAudioSources(payload.sources || [])
        if (payload.selectedSource) {
          setSelectedAudioSource(payload.selectedSource)
        } else if (payload.defaultSource) {
          setSelectedAudioSource(payload.defaultSource)
        } else if ((payload.sources || []).length > 0) {
          setSelectedAudioSource(payload.sources[0])
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
        setIsQuerying(Boolean(payload.running))
      },
      onQueryResponse: (payload) => {
        setIsQuerying(false)
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
          latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
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
          results: payload.results || [],
          attempts: Array.isArray(payload.attempts) ? payload.attempts : []
        }
        setBenchmarkHistory((prev) => [run, ...prev].slice(0, MAX_BENCHMARK_HISTORY))
      },
      onError: (payload) => {
        setIsQuerying(false)
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

  const canRun = selectedText.trim().length > 0

  const runPreset = () => {
    client.send({
      type: 'run_query',
      requestId: crypto.randomUUID(),
      presetId: selectedPresetId,
      customInstruction: null,
      selectedText,
      selectionTimeRange: selectionRange,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const runCustom = () => {
    client.send({
      type: 'run_query',
      requestId: crypto.randomUUID(),
      presetId: null,
      customInstruction: customInstruction.trim(),
      selectedText,
      selectionTimeRange: selectionRange,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const startTranscription = () => {
    if (selectedAudioSource) {
      client.send({ type: 'set_audio_source', sourceName: selectedAudioSource })
    }
    client.send({ type: 'start_transcription' })
  }

  const stopTranscription = () => {
    client.send({ type: 'stop_transcription' })
    setAudioLevel(0)
    setAudioRms(0)
  }

  const clearTranscript = () => {
    setSegments([])
    setLiveText('')
    setLiveRows([])
    client.send({ type: 'clear_transcript' })
  }

  const refreshAudioSources = () => {
    client.send({ type: 'get_audio_sources' })
  }

  const changeAudioSource = (sourceName: string) => {
    setSelectedAudioSource(sourceName)
    client.send({ type: 'set_audio_source', sourceName })
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
            audioLevel={audioLevel}
            audioRms={audioRms}
            audioSources={audioSources}
            selectedAudioSource={selectedAudioSource}
            onAudioSourceChange={changeAudioSource}
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
                setSelectionRange(range)
              }}
              onClear={clearTranscript}
            />
            <OutputPane
              output={output}
              isQuerying={isQuerying}
              screenshotDataUrl={screenshotDataUrl}
              onClearScreenshot={() => setScreenshotDataUrl(null)}
              latencyMs={lastQueryLatencyMs}
              model={lastResponseModel}
              screenshotUsed={lastScreenshotUsed}
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
