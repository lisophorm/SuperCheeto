import React, { useState } from 'react'
import { Preset } from '../types'

type Props = {
  presets: Preset[]
  selectedPresetId: string
  onPresetChange: (value: string) => void
  customInstruction: string
  onCustomInstructionChange: (value: string) => void
  models: string[]
  selectedModel: string
  onModelChange: (model: string) => void
  onCaptureScreen: () => void
  onRunPreset: () => void
  onRunCustom: () => void
  canRun: boolean
  isQuerying: boolean
  status: string
  isRunning: boolean
  audioLevel: number
  audioRms: number
  audioSources: string[]
  selectedAudioSource: string
  onAudioSourceChange: (sourceName: string) => void
  onRefreshAudioSources: () => void
  onStart: () => void
  onStop: () => void
}

const PromptBar: React.FC<Props> = ({
  presets,
  selectedPresetId,
  onPresetChange,
  customInstruction,
  onCustomInstructionChange,
  models,
  selectedModel,
  onModelChange,
  onCaptureScreen,
  onRunPreset,
  onRunCustom,
  canRun,
  isQuerying,
  status,
  isRunning,
  audioLevel,
  audioRms,
  audioSources,
  selectedAudioSource,
  onAudioSourceChange,
  onRefreshAudioSources,
  onStart,
  onStop
}) => {
  const [customExpanded, setCustomExpanded] = useState(false)

  return (
    <section className="prompt-bar">
      <div className="prompt-controls">
        <div className="status-pill">{status}</div>
        <div className="meter-wrap" aria-label="Audio input level">
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.round(audioLevel * 100)}%` }} />
          </div>
          <div className="meter-label">Audio {audioRms.toFixed(4)}</div>
        </div>
        <button className={isRunning ? 'ghost' : 'primary'} onClick={onStart}>Start</button>
        <button className={isRunning ? 'primary' : 'ghost'} onClick={onStop}>Stop</button>
      </div>
      <div className="prompt-controls">
        <div className="select-wrap">
          <label>Audio source</label>
          <select value={selectedAudioSource} onChange={(event) => onAudioSourceChange(event.target.value)}>
            {audioSources.length === 0 ? (
              <option value="">No sources found</option>
            ) : (
              audioSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))
            )}
          </select>
        </div>
        <button className="ghost" onClick={onRefreshAudioSources}>Refresh sources</button>
        <div className="select-wrap">
          <label>Model</label>
          <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
            {models.length === 0 ? (
              <option value="">No models loaded</option>
            ) : (
              models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
        </div>
        <button className="ghost" onClick={onCaptureScreen}>Capture Screen</button>
        <div className="select-wrap">
          <label>Preset</label>
          <select value={selectedPresetId} onChange={(event) => onPresetChange(event.target.value)}>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={onRunPreset} disabled={!canRun || isQuerying}>
          Run preset
        </button>
        <div className="input-wrap">
          <label>Custom instruction</label>
          {customExpanded ? (
            <textarea
              className="custom-instruction"
              placeholder="Type your own instruction"
              value={customInstruction}
              onChange={(event) => onCustomInstructionChange(event.target.value)}
              onBlur={() => setCustomExpanded(false)}
              autoFocus
              rows={4}
            />
          ) : (
            <input
              type="text"
              placeholder="Type your own instruction"
              value={customInstruction}
              onChange={(event) => onCustomInstructionChange(event.target.value)}
              onFocus={() => setCustomExpanded(true)}
            />
          )}
        </div>
        <button className="ghost" onClick={onRunCustom} disabled={!canRun || !customInstruction.trim() || isQuerying}>
          Run custom
        </button>
      </div>
    </section>
  )
}

export default PromptBar
