import React from 'react'

type Props = {
  output: string
}

const OutputPane: React.FC<Props> = ({ output }) => {
  return (
    <section className="pane output">
      <header>
        <div>
          <h2>Response</h2>
          <p>Latest answer from OpenAI based on the selected transcript.</p>
        </div>
      </header>
      <div className="output-body">
        {output ? <pre>{output}</pre> : <p className="muted">No response yet.</p>}
      </div>
    </section>
  )
}

export default OutputPane
