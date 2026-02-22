import React from 'react'

type Props = {
  output: string
  isQuerying: boolean
  screenshotDataUrl: string | null
  onClearScreenshot: () => void
  latencyMs: number | null
  model: string
  screenshotUsed: boolean
}

const OutputPane: React.FC<Props> = ({
  output,
  isQuerying,
  screenshotDataUrl,
  onClearScreenshot,
  latencyMs,
  model,
  screenshotUsed
}) => {
  return (
    <section className="pane output">
      <header>
        <div>
          <h2>Response</h2>
          <p>Latest answer from OpenAI based on the selected transcript.</p>
        </div>
        {isQuerying ? <div className="querying-pill">Querying OpenAI...</div> : null}
      </header>
      <div className="output-body">
        {latencyMs !== null ? (
          <div className="response-meta">
            <span>Latency: {Math.round(latencyMs)} ms</span>
            <span>Model: {model || '-'}</span>
            <span>Screenshot sent: {screenshotUsed ? 'yes' : 'no'}</span>
          </div>
        ) : null}
        {screenshotDataUrl ? (
          <div className="screenshot-preview">
            <img src={screenshotDataUrl} alt="Captured screen thumbnail" />
            <button className="ghost danger overlay-trash" onClick={onClearScreenshot}>Trash</button>
          </div>
        ) : null}
        {output ? <pre>{output}</pre> : <p className="muted">No response yet.</p>}
      </div>
    </section>
  )
}

export default OutputPane
