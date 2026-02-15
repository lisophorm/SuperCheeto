type WSHandlers = {
  onStatus: (payload: { state: string; details?: string }) => void
  onLive: (payload: { text: string; t: number }) => void
  onSegment: (payload: { segment: any }) => void
  onQueryResponse: (payload: { requestId?: string; text: string }) => void
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
          case 'query_response':
            this.handlers.onQueryResponse(data)
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
