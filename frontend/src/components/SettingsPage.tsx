import React, { useMemo, useState } from 'react'
import { BenchmarkResult, OpenAIModelInfo } from '../types'

type Props = {
  models: string[]
  modelDetails: OpenAIModelInfo[]
  includeScreenshotInQuery: boolean
  onToggleIncludeScreenshot: (next: boolean) => void
  onRefreshModelDetails: () => void
  onRunBenchmark: (payload: { models: string[]; instruction: string; selectedText: string; repeats: number }) => void
  benchmarkRunning: boolean
  benchmarkProgress: { completed: number; total: number } | null
  benchmarkResults: BenchmarkResult[]
}

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

const SettingsPage: React.FC<Props> = ({
  models,
  modelDetails,
  includeScreenshotInQuery,
  onToggleIncludeScreenshot,
  onRefreshModelDetails,
  onRunBenchmark,
  benchmarkRunning,
  benchmarkProgress,
  benchmarkResults
}) => {
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [repeats, setRepeats] = useState(2)
  const [instruction, setInstruction] = useState('Answer clearly and concisely.')
  const [selectedText, setSelectedText] = useState('Summarize the key claim in one sentence.')

  const availableModels = useMemo(() => {
    if (modelDetails.length > 0) {
      return modelDetails.map((item) => item.id)
    }
    return models
  }, [modelDetails, models])

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => (prev.includes(model) ? prev.filter((id) => id !== model) : [...prev, model]))
  }

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
              <p>Run repeated latency checks across selected models.</p>
            </div>
          </header>
          <div className="settings-body">
            <div className="input-wrap">
              <label>Instruction</label>
              <input value={instruction} onChange={(event) => setInstruction(event.target.value)} />
            </div>
            <div className="input-wrap">
              <label>Input Text</label>
              <textarea
                rows={3}
                value={selectedText}
                onChange={(event) => setSelectedText(event.target.value)}
              />
            </div>
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
              onClick={() => onRunBenchmark({ models: selectedModels, instruction, selectedText, repeats })}
              disabled={benchmarkRunning || selectedModels.length === 0 || !instruction.trim() || !selectedText.trim()}
            >
              {benchmarkRunning ? 'Running benchmark...' : 'Run benchmark'}
            </button>
            {benchmarkProgress ? (
              <p className="muted">
                Progress: {benchmarkProgress.completed}/{benchmarkProgress.total}
              </p>
            ) : null}
            {benchmarkResults.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Runs</th>
                    <th>Failures</th>
                    <th>Avg</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkResults.map((row) => (
                    <tr key={row.model}>
                      <td>{row.model}</td>
                      <td>{row.runs}</td>
                      <td>{row.failures}</td>
                      <td>{formatMs(row.avgLatencyMs)}</td>
                      <td>{formatMs(row.minLatencyMs)}</td>
                      <td>{formatMs(row.maxLatencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  )
}

export default SettingsPage
