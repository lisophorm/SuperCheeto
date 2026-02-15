from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Set

import websockets
from websockets.server import WebSocketServerProtocol


@dataclass
class WSMessage:
    type: str
    payload: Dict[str, Any]


class WebSocketHub:
    def __init__(self, host: str, port: int, handler: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        self.host = host
        self.port = port
        self._handler = handler
        self._clients: Set[WebSocketServerProtocol] = set()
        self._server = None

    async def start(self) -> None:
        self._server = await websockets.serve(self._client_handler, self.host, self.port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        self._server = None

    async def broadcast(self, msg_type: str, payload: Dict[str, Any]) -> None:
        if not self._clients:
            return
        message = json.dumps({"type": msg_type, **payload})
        await asyncio.gather(
            *[client.send(message) for client in list(self._clients) if not client.closed],
            return_exceptions=True,
        )

    async def _client_handler(self, websocket: WebSocketServerProtocol):
        self._clients.add(websocket)
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue
                await self._handler(data)
        finally:
            self._clients.discard(websocket)
