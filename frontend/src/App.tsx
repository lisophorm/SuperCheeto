import React, { useEffect, useMemo, useState } from 'react'
import PromptBar from './components/PromptBar'
import TranscriptPane from './components/TranscriptPane'
import OutputPane from './components/OutputPane'
import { Preset, SelectionRange, TranscriptSegment } from './types'
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

const App: React.FC = () => {
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [liveText, setLiveText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState<SelectionRange>(null)
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('Connecting…')
  const [customInstruction, setCustomInstruction] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id)

  const client = useMemo(() => {
    return new WSClient('ws://127.0.0.1:8765', {
      onStatus: (payload) => {
        if (payload.details) {
          setStatus(`${payload.state}: ${payload.details}`)
        } else {
          setStatus(payload.state)
        }
      },
      onLive: (payload) => {
        setLiveText(payload.text)
      },
      onSegment: (payload) => {
        setSegments((prev) => [...prev, payload.segment])
      },
      onQueryResponse: (payload) => {
        setOutput(payload.text)
      },
      onError: (payload) => {
        setStatus(`error: ${payload.message}`)
      }
    })
  }, [])

  useEffect(() => {
    client.connect()
  }, [client])

  const canRun = selectedText.trim().length > 0

  const runPreset = () => {
    client.send({
      type: 'run_query',
      requestId: crypto.randomUUID(),
      presetId: selectedPresetId,
      customInstruction: null,
      selectedText,
      selectionTimeRange: selectionRange
    })
  }

  const runCustom = () => {
    client.send({
      type: 'run_query',
      requestId: crypto.randomUUID(),
      presetId: null,
      customInstruction: customInstruction.trim(),
      selectedText,
      selectionTimeRange: selectionRange
    })
  }

  const startTranscription = () => {
    client.send({ type: 'start_transcription' })
  }

  const stopTranscription = () => {
    client.send({ type: 'stop_transcription' })
  }

  const clearTranscript = () => {
    setSegments([])
    setLiveText('')
    client.send({ type: 'clear_transcript' })
  }

  return (
    <div className="app">
      <PromptBar
        presets={PRESETS}
        selectedPresetId={selectedPresetId}
        onPresetChange={setSelectedPresetId}
        customInstruction={customInstruction}
        onCustomInstructionChange={setCustomInstruction}
        onRunPreset={runPreset}
        onRunCustom={runCustom}
        canRun={canRun}
        status={status}
        onStart={startTranscription}
        onStop={stopTranscription}
      />

      <div className="content">
        <TranscriptPane
          segments={segments}
          liveText={liveText}
          onSelectionChange={(text, range) => {
            setSelectedText(text)
            setSelectionRange(range)
          }}
          onClear={clearTranscript}
        />
        <OutputPane output={output} />
      </div>

      <section className="selection">
        <div>
          <h3>Selected text</h3>
          <p className={selectedText ? 'selected' : 'muted'}>
            {selectedText || 'Select any portion of the transcript to enable prompts.'}
          </p>
        </div>
      </section>
    </div>
  )
}

export default App
