import React, { useMemo, useState } from 'react'
import {
  BenchmarkCaseInput,
  BenchmarkImageAsset,
  BenchmarkLiveLog,
  BenchmarkProgress,
  BenchmarkRun,
  OpenAIModelInfo
} from '../types'

type Props = {
  models: string[]
  modelDetails: OpenAIModelInfo[]
  includeScreenshotInQuery: boolean
  onToggleIncludeScreenshot: (next: boolean) => void
  onRefreshModelDetails: () => void
  onRunBenchmark: (payload: { models: string[]; instruction: string; tests: BenchmarkCaseInput[]; repeats: number }) => void
  benchmarkRunning: boolean
  benchmarkProgress: BenchmarkProgress | null
  benchmarkLiveLogs: BenchmarkLiveLog[]
  benchmarkHistory: BenchmarkRun[]
  benchmarkImages: BenchmarkImageAsset[]
  onUpsertBenchmarkImage: (image: BenchmarkImageAsset) => void
  onDeleteBenchmarkImage: (refId: string) => void
  onClearBenchmarkHistory: () => void
}

const DEFAULT_BENCHMARK_INSTRUCTION = `You are BenchmarkBot. Your job is to complete the given test as accurately as possible while following the required output format.

Your harness supplies TEST_ID, IMAGE_1 (optional), and the test's USER_PROMPT.

Hard rules

If the test includes image(s), you MUST use them. If you cannot see/process images, you MUST say so explicitly.

Do not browse the web. Do not ask follow-up questions unless the test explicitly allows it.

Be concise but complete. Prefer bullet points where useful.

Output format (MUST be valid JSON)
Return a single JSON object with these keys:

test_id (string): copy exactly from input
image_used (boolean): true if you used image content, false otherwise
image_capability_claim (string): one of "worked" | "not_supported" | "uncertain"
answer (string): your final answer to the task
confidence (number 0-1): calibrated confidence
self_check (array of strings): short checklist of what you verified
failure_modes (array of strings): if anything went wrong, describe it

Calibration

If you are guessing, say so in failure_modes and lower confidence.

If image content is required but you can't access it, set:

image_used=false
image_capability_claim="not_supported"
confidence<=0.2

Now run the test below.`

const formatDate = (timestamp: number | null) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toISOString().slice(0, 10)
}

const formatMs = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '-'
  return `${Math.round(value)} ms`
}

type LatestModelResult = {
  model: string
  hasData: boolean
  createdAt: number | null
  benchmarkId: string | null
  testCount: number
  runs: number
  failures: number
  jsonValidRuns: number
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
}

type EditableBenchmarkTest = {
  rowId: number
  testId: string
  imageRef: string
  userPrompt: string
}

const SettingsPage: React.FC<Props> = ({
  models,
  modelDetails,
  includeScreenshotInQuery,
  onToggleIncludeScreenshot,
  onRefreshModelDetails,
  onRunBenchmark,
  benchmarkRunning,
  benchmarkProgress,
  benchmarkLiveLogs,
  benchmarkHistory,
  benchmarkImages,
  onUpsertBenchmarkImage,
  onDeleteBenchmarkImage,
  onClearBenchmarkHistory
}) => {
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [repeats, setRepeats] = useState(2)
  const [instruction, setInstruction] = useState(DEFAULT_BENCHMARK_INSTRUCTION)
  const [imageRefInput, setImageRefInput] = useState('IMAGE_1')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState('')
  const [tests, setTests] = useState<EditableBenchmarkTest[]>([
    {
      rowId: 1,
      testId: 'test_001',
      imageRef: '',
      userPrompt: 'Summarize the key claim in one sentence.'
    },
    {
      rowId: 2,
      testId: 'test_002',
      imageRef: 'IMAGE_1',
      userPrompt: 'Describe what visual evidence supports the claim.'
    }
  ])
  const [selectedTestRowId, setSelectedTestRowId] = useState<number | null>(null)
  const [draftTestId, setDraftTestId] = useState('test_003')
  const [draftImageRef, setDraftImageRef] = useState('IMAGE_1')
  const [draftUserPrompt, setDraftUserPrompt] = useState('')
  const [testError, setTestError] = useState('')

  const availableModels = useMemo(() => {
    if (modelDetails.length > 0) {
      return modelDetails.map((item) => item.id)
    }
    return models
  }, [modelDetails, models])

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => (prev.includes(model) ? prev.filter((id) => id !== model) : [...prev, model]))
  }

  const knownImageRefs = useMemo(
    () => new Set(benchmarkImages.map((image) => image.refId)),
    [benchmarkImages]
  )

  const testsWithMissingImageRef = useMemo(
    () => tests.filter((test) => test.imageRef.trim() && !knownImageRefs.has(test.imageRef.trim())),
    [knownImageRefs, tests]
  )

  const uploadBenchmarkImage = async () => {
    const refId = imageRefInput.trim()
    if (!refId) {
      setImageError('Image ref id is required.')
      return
    }
    if (!selectedImageFile) {
      setImageError('Select an image file first.')
      return
    }
    if (!selectedImageFile.type.startsWith('image/')) {
      setImageError('Only image files are supported.')
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed reading image file.'))
        reader.readAsDataURL(selectedImageFile)
      })
      if (!dataUrl.startsWith('data:image/')) {
        setImageError('Image conversion failed.')
        return
      }
      onUpsertBenchmarkImage({
        refId,
        dataUrl,
        filename: selectedImageFile.name,
        createdAt: Math.floor(Date.now() / 1000)
      })
      setImageError('')
      setSelectedImageFile(null)
    } catch (error) {
      setImageError(String(error))
    }
  }

  const resetTestDraft = () => {
    setSelectedTestRowId(null)
    setDraftTestId(`test_${String(tests.length + 1).padStart(3, '0')}`)
    setDraftImageRef('IMAGE_1')
    setDraftUserPrompt('')
    setTestError('')
  }

  const validateTestDraft = (rowIdToUpdate: number | null): string | null => {
    const testId = draftTestId.trim()
    const imageRef = draftImageRef.trim()
    const userPrompt = draftUserPrompt.trim()
    if (!testId) {
      return 'Test id is required.'
    }
    if (!userPrompt) {
      return 'Test prompt is required.'
    }
    if (imageRef && !knownImageRefs.has(imageRef)) {
      return `Unknown image ref: ${imageRef}`
    }
    const duplicate = tests.find((item) => item.testId === testId && item.rowId !== rowIdToUpdate)
    if (duplicate) {
      return `Duplicate test id: ${testId}`
    }
    return null
  }

  const createTest = () => {
    const validationError = validateTestDraft(null)
    if (validationError) {
      setTestError(validationError)
      return
    }
    const nextRowId = tests.reduce((max, item) => Math.max(max, item.rowId), 0) + 1
    setTests((prev) => [
      ...prev,
      {
        rowId: nextRowId,
        testId: draftTestId.trim(),
        imageRef: draftImageRef.trim(),
        userPrompt: draftUserPrompt.trim()
      }
    ])
    setTestError('')
    setSelectedTestRowId(nextRowId)
  }

  const updateSelectedTest = () => {
    if (selectedTestRowId === null) {
      setTestError('Select a test row first.')
      return
    }
    const validationError = validateTestDraft(selectedTestRowId)
    if (validationError) {
      setTestError(validationError)
      return
    }
    setTests((prev) =>
      prev.map((item) =>
        item.rowId === selectedTestRowId
          ? {
              ...item,
              testId: draftTestId.trim(),
              imageRef: draftImageRef.trim(),
              userPrompt: draftUserPrompt.trim()
            }
          : item
      )
    )
    setTestError('')
  }

  const deleteSelectedTest = () => {
    if (selectedTestRowId === null) {
      setTestError('Select a test row to delete.')
      return
    }
    setTests((prev) => prev.filter((item) => item.rowId !== selectedTestRowId))
    resetTestDraft()
  }

  const selectTest = (row: EditableBenchmarkTest) => {
    setSelectedTestRowId(row.rowId)
    setDraftTestId(row.testId)
    setDraftImageRef(row.imageRef)
    setDraftUserPrompt(row.userPrompt)
    setTestError('')
  }

  const benchmarkCases: BenchmarkCaseInput[] = useMemo(
    () =>
      tests.map((test) => ({
        testId: test.testId.trim(),
        userPrompt: test.userPrompt.trim(),
        imageRef: test.imageRef.trim() || null
      })),
    [tests]
  )

  const latestPerModel = useMemo<LatestModelResult[]>(() => {
    const discoveredModels = new Set<string>()
    for (const run of benchmarkHistory) {
      for (const row of run.results) {
        discoveredModels.add(row.model)
      }
    }

    const modelOrder = availableModels.length > 0
      ? availableModels
      : Array.from(discoveredModels).sort((a, b) => a.localeCompare(b))

    const rows: LatestModelResult[] = modelOrder.map((model) => ({
      model,
      hasData: false,
      createdAt: null,
      benchmarkId: null,
      testCount: 0,
      runs: 0,
      failures: 0,
      jsonValidRuns: 0,
      avgLatencyMs: null,
      minLatencyMs: null,
      maxLatencyMs: null
    }))

    for (let i = 0; i < rows.length; i += 1) {
      const model = rows[i].model
      for (const run of benchmarkHistory) {
        const matchingRows = run.results.filter((item) => item.model === model)
        if (matchingRows.length === 0) continue

        const runs = matchingRows.reduce((sum, item) => sum + item.runs, 0)
        const failures = matchingRows.reduce((sum, item) => sum + item.failures, 0)
        const jsonValidRuns = matchingRows.reduce((sum, item) => sum + item.jsonValidRuns, 0)
        const weightedLatencySum = matchingRows.reduce(
          (sum, item) => sum + ((item.avgLatencyMs ?? 0) * item.runs),
          0
        )
        const latenciesMin = matchingRows.map((item) => item.minLatencyMs).filter((item): item is number => item !== null)
        const latenciesMax = matchingRows.map((item) => item.maxLatencyMs).filter((item): item is number => item !== null)

        rows[i] = {
          model,
          hasData: true,
          createdAt: run.createdAt,
          benchmarkId: run.benchmarkId,
          testCount: matchingRows.length,
          runs,
          failures,
          jsonValidRuns,
          avgLatencyMs: runs > 0 ? weightedLatencySum / runs : null,
          minLatencyMs: latenciesMin.length > 0 ? Math.min(...latenciesMin) : null,
          maxLatencyMs: latenciesMax.length > 0 ? Math.max(...latenciesMax) : null
        }
        break
      }
    }

    return rows
  }, [availableModels, benchmarkHistory])

  return (
    <section className="settings-page">
      <div className="settings-grid">
        <section className="pane">
          <header>
            <div>
              <h2>Query Settings</h2>
              <p>Controls for query behavior and benchmark setup.</p>
            </div>
          </header>
          <div className="settings-body">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeScreenshotInQuery}
                onChange={(event) => onToggleIncludeScreenshot(event.target.checked)}
              />
              <span>Send captured screenshot with query when available</span>
            </label>
            <p className="muted">When disabled, screenshot stays local and is never sent to OpenAI.</p>
          </div>
        </section>

        <section className="pane">
          <header>
            <div>
              <h2>Model Catalog</h2>
              <p>Metadata returned by OpenAI models endpoint.</p>
            </div>
            <button className="ghost" onClick={onRefreshModelDetails}>Refresh model info</button>
          </header>
          <div className="settings-body table-wrap">
            {modelDetails.length === 0 ? (
              <p className="muted">No model metadata loaded yet.</p>
            ) : (
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Owner</th>
                    <th>Created</th>
                    <th>Object</th>
                  </tr>
                </thead>
                <tbody>
                  {modelDetails.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.owned_by || '-'}</td>
                      <td>{formatDate(item.created)}</td>
                      <td>{item.object}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="pane">
          <header>
            <div>
              <h2>Benchmark</h2>
              <p>Run repeated benchmark tests across selected models.</p>
            </div>
          </header>
          <div className="settings-body">
            <div className="input-wrap">
              <label>Harness Instruction</label>
              <textarea
                rows={14}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </div>
            <section className="benchmark-images">
              <h3>Benchmark Images</h3>
              <p className="muted">Upload once, then assign image refs to tests (for example: IMAGE_1).</p>
              <div className="benchmark-image-upload">
                <div className="input-wrap small-input">
                  <label>Image Ref Id</label>
                  <input value={imageRefInput} onChange={(event) => setImageRefInput(event.target.value)} />
                </div>
                <div className="input-wrap">
                  <label>Image File</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setSelectedImageFile(event.target.files?.[0] || null)}
                  />
                </div>
                <button className="ghost" onClick={uploadBenchmarkImage}>Upload/Replace</button>
              </div>
              {imageError ? <p className="muted">{imageError}</p> : null}
              {benchmarkImages.length > 0 ? (
                <table className="settings-table compact">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Filename</th>
                      <th>Preview</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkImages.map((image) => (
                      <tr key={image.refId}>
                        <td>{image.refId}</td>
                        <td>{image.filename}</td>
                        <td><img className="benchmark-image-thumb" src={image.dataUrl} alt={image.refId} /></td>
                        <td>
                          <button className="ghost danger" onClick={() => onDeleteBenchmarkImage(image.refId)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No benchmark images uploaded yet.</p>
              )}
            </section>
            <section className="benchmark-tests">
              <div className="benchmark-history-header">
                <h3>Tests</h3>
                <button className="ghost" onClick={resetTestDraft}>New test</button>
              </div>
              <p className="muted">
                Create/update tests here. Prompt uses a dedicated 5-row textarea.
              </p>
              <div className="benchmark-test-form">
                <div className="input-wrap small-input">
                  <label>Test Id</label>
                  <input value={draftTestId} onChange={(event) => setDraftTestId(event.target.value)} />
                </div>
                <div className="input-wrap small-input">
                  <label>Image Ref (optional)</label>
                  <input
                    value={draftImageRef}
                    onChange={(event) => setDraftImageRef(event.target.value)}
                    placeholder="-"
                  />
                </div>
                <div className="input-wrap">
                  <label>Test Prompt</label>
                  <textarea
                    rows={5}
                    value={draftUserPrompt}
                    onChange={(event) => setDraftUserPrompt(event.target.value)}
                  />
                </div>
                <div className="benchmark-test-actions">
                  <button className="ghost" onClick={createTest}>Create</button>
                  <button className="ghost" onClick={updateSelectedTest}>Update selected</button>
                  <button className="ghost danger" onClick={deleteSelectedTest}>Delete selected</button>
                </div>
              </div>
              {testError ? <p className="muted">{testError}</p> : null}
              {testsWithMissingImageRef.length > 0 ? (
                <p className="muted">
                  Missing image refs in tests:{' '}
                  {testsWithMissingImageRef.map((test) => `${test.testId}:${test.imageRef}`).join(', ')}
                </p>
              ) : null}
              {tests.length > 0 ? (
                <table className="settings-table compact">
                  <thead>
                    <tr>
                      <th>Test Id</th>
                      <th>Image Ref</th>
                      <th>Prompt</th>
                      <th>Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((test) => (
                      <tr key={test.rowId}>
                        <td>{test.testId}</td>
                        <td>{test.imageRef || '-'}</td>
                        <td>{test.userPrompt}</td>
                        <td>
                          <button className="ghost" onClick={() => selectTest(test)}>
                            {selectedTestRowId === test.rowId ? 'Selected' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No tests configured yet.</p>
              )}
            </section>
            <div className="input-wrap small-input">
              <label>Repeats per model (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={repeats}
                onChange={(event) => setRepeats(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
              />
            </div>
            <div className="model-checklist">
              {availableModels.map((model) => (
                <label key={model}>
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model)}
                    onChange={() => toggleModel(model)}
                  />
                  <span>{model}</span>
                </label>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => onRunBenchmark({ models: selectedModels, instruction, tests: benchmarkCases, repeats })}
              disabled={
                benchmarkRunning ||
                selectedModels.length === 0 ||
                !instruction.trim() ||
                benchmarkCases.length === 0 ||
                testsWithMissingImageRef.length > 0
              }
            >
              {benchmarkRunning ? 'Running benchmark...' : 'Run benchmark'}
            </button>
            {benchmarkProgress ? (
              <p className="muted">
                Progress: {benchmarkProgress.completed}/{benchmarkProgress.total}
                {benchmarkProgress.testId ? ` | test: ${benchmarkProgress.testId}` : ''}
                {benchmarkProgress.model ? ` | model: ${benchmarkProgress.model}` : ''}
                {benchmarkProgress.run ? ` | run: ${benchmarkProgress.run}` : ''}
                {typeof benchmarkProgress.successes === 'number' ? ` | ok: ${benchmarkProgress.successes}` : ''}
                {typeof benchmarkProgress.failures === 'number' ? ` | failed: ${benchmarkProgress.failures}` : ''}
              </p>
            ) : null}
            <h3>Live Runner Log</h3>
            {benchmarkLiveLogs.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Test</th>
                    <th>Model</th>
                    <th>Image Ref</th>
                    <th>Status</th>
                    <th>JSON</th>
                    <th>Latency</th>
                    <th>Error</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkLiveLogs.map((log, index) => (
                    <tr key={`${log.benchmarkId}:${log.testId}:${log.model}:${log.run}:${index}`}>
                      <td>{log.run}</td>
                      <td>{log.testId}</td>
                      <td>{log.model}</td>
                      <td>{log.imageRef || '-'}</td>
                      <td>{log.success ? 'ok' : 'failed'}</td>
                      <td>{log.jsonValid ? 'yes' : 'no'}</td>
                      <td>{formatMs(log.latencyMs)}</td>
                      <td>{log.error || '-'}</td>
                      <td>{log.responsePreview || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No live benchmark logs yet.</p>
            )}
            <h3>Latest Result Per Model</h3>
            {latestPerModel.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Last Run</th>
                    <th>Benchmark</th>
                    <th>Tests</th>
                    <th>Runs</th>
                    <th>Failures</th>
                    <th>JSON Valid</th>
                    <th>Avg</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPerModel.map((row) => (
                    <tr key={`latest:${row.model}`}>
                      <td>{row.model}</td>
                      <td>{row.createdAt ? new Date(row.createdAt * 1000).toLocaleString() : '-'}</td>
                      <td>{row.benchmarkId || '-'}</td>
                      <td>{row.hasData ? row.testCount : '-'}</td>
                      <td>{row.hasData ? row.runs : '-'}</td>
                      <td>{row.hasData ? row.failures : '-'}</td>
                      <td>{row.hasData ? row.jsonValidRuns : '-'}</td>
                      <td>{formatMs(row.avgLatencyMs)}</td>
                      <td>{formatMs(row.minLatencyMs)}</td>
                      <td>{formatMs(row.maxLatencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No models available yet.</p>
            )}
            <div className="benchmark-history-header">
              <h3>Benchmark History</h3>
              <button className="ghost" onClick={onClearBenchmarkHistory} disabled={benchmarkHistory.length === 0}>
                Clear history
              </button>
            </div>
            {benchmarkHistory.length > 0 ? (
              <div className="benchmark-history">
                {benchmarkHistory.map((run) => {
                  const succeeded = run.attempts.filter((item) => item.success).length
                  return (
                    <section key={run.benchmarkId} className="benchmark-run">
                      <p className="muted benchmark-run-meta">
                        {new Date(run.createdAt * 1000).toLocaleString()} | {run.benchmarkId} | tests: {run.tests.length}
                        {' | '}attempts: {run.attempts.length} | succeeded: {succeeded}
                      </p>
                      <table className="settings-table compact">
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Model</th>
                            <th>Runs</th>
                            <th>Failures</th>
                            <th>JSON Valid</th>
                            <th>Avg</th>
                            <th>Min</th>
                            <th>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.results.map((row) => (
                            <tr key={`${run.benchmarkId}:${row.testId}:${row.model}`}>
                              <td>{row.testId}</td>
                              <td>{row.model}</td>
                              <td>{row.runs}</td>
                              <td>{row.failures}</td>
                              <td>{row.jsonValidRuns}</td>
                              <td>{formatMs(row.avgLatencyMs)}</td>
                              <td>{formatMs(row.minLatencyMs)}</td>
                              <td>{formatMs(row.maxLatencyMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )
                })}
              </div>
            ) : (
              <p className="muted">No benchmark runs yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

export default SettingsPage
