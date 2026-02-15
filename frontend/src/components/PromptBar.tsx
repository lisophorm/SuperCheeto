import React from 'react'
import { Preset } from '../types'

type Props = {
  presets: Preset[]
  selectedPresetId: string
  onPresetChange: (value: string) => void
  customInstruction: string
  onCustomInstructionChange: (value: string) => void
  onRunPreset: () => void
  onRunCustom: () => void
  canRun: boolean
  status: string
  onStart: () => void
  onStop: () => void
}

const PromptBar: React.FC<Props> = ({
  presets,
  selectedPresetId,
  onPresetChange,
  customInstruction,
  onCustomInstructionChange,
  onRunPreset,
  onRunCustom,
  canRun,
  status,
  onStart,
  onStop
}) => {
  return (
    <section className="prompt-bar">
      <div className="prompt-controls">
        <div className="status-pill">{status}</div>
        <button className="primary" onClick={onStart}>Start</button>
        <button className="ghost" onClick={onStop}>Stop</button>
      </div>
      <div className="prompt-controls">
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
        <button className="primary" onClick={onRunPreset} disabled={!canRun}>
          Run preset
        </button>
        <div className="input-wrap">
          <label>Custom instruction</label>
          <input
            type="text"
            placeholder="Type your own instruction"
            value={customInstruction}
            onChange={(event) => onCustomInstructionChange(event.target.value)}
          />
        </div>
        <button className="ghost" onClick={onRunCustom} disabled={!canRun || !customInstruction.trim()}>
          Run custom
        </button>
      </div>
    </section>
  )
}

export default PromptBar
