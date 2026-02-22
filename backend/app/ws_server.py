from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Set

import websockets
from websockets.server import ServerConnection


@dataclass
class WSMessage:
    type: str
    payload: Dict[str, Any]


class WebSocketHub:
    def __init__(self, host: str, port: int, handler: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        self.host = host
        self.port = port
        self._handler = handler
        self._clients: Set[ServerConnection] = set()
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
        clients = list(self._clients)
        results = await asyncio.gather(
            *[client.send(message) for client in clients],
            return_exceptions=True,
        )
        for client, result in zip(clients, results):
            if isinstance(result, Exception):
                self._clients.discard(client)

    async def _client_handler(self, websocket: ServerConnection):
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
