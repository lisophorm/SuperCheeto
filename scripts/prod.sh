#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${RUN_DIR}/prod-backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/prod-frontend.pid"
BACKEND_LOG_FILE="${RUN_DIR}/prod-backend.log"
FRONTEND_LOG_FILE="${RUN_DIR}/prod-frontend.log"
BACKEND_WS_PORT="${BACKEND_WS_PORT:-8765}"
PROD_FRONTEND_REBUILD="${PROD_FRONTEND_REBUILD:-0}"

mkdir -p "${RUN_DIR}"

is_pid_running() {
    local pid="$1"
    kill -0 "${pid}" >/dev/null 2>&1
}

pgid_for_pid() {
    local pid="$1"
    ps -o pgid= -p "${pid}" 2>/dev/null | tr -d ' '
}

read_pid() {
    local pid_file="$1"
    if [[ -f "${pid_file}" ]]; then
        cat "${pid_file}"
    fi
}

backend_listener_pids() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -t -nP -iTCP:"${BACKEND_WS_PORT}" -sTCP:LISTEN 2>/dev/null | sort -u
        return
    fi

    if command -v ss >/dev/null 2>&1; then
        ss -ltnp "( sport = :${BACKEND_WS_PORT} )" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
    fi
}

frontend_prod_pids() {
    {
        pgrep -f "${ROOT_DIR}/frontend/node_modules/.bin/electron .*${ROOT_DIR}/frontend/dist-electron/main.cjs" || true
        pgrep -f "${ROOT_DIR}/frontend/node_modules/electron/dist/electron .*${ROOT_DIR}/frontend/dist-electron/main.cjs" || true
        pgrep -f "${ROOT_DIR}/frontend/dist-electron/main.cjs" || true
    } | sort -u
}

pgids_for_pids() {
    local pids="${1:-}"
    while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        local pgid
        pgid="$(pgid_for_pid "${pid}")"
        [[ -n "${pgid}" ]] && echo "${pgid}"
    done <<< "${pids}" | sort -u
}

format_pids_inline() {
    tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

cleanup_stale_pid_file() {
    local pid_file="$1"
    local pid
    pid="$(read_pid "${pid_file}")"

    if [[ -n "${pid:-}" ]] && ! is_pid_running "${pid}"; then
        rm -f "${pid_file}"
    fi
}

start_backend() {
    cleanup_stale_pid_file "${BACKEND_PID_FILE}"

    if [[ -f "${BACKEND_PID_FILE}" ]] && is_pid_running "$(cat "${BACKEND_PID_FILE}")"; then
        echo "[backend] already running (pid $(cat "${BACKEND_PID_FILE}"))"
        return
    fi

    local listener_pids
    listener_pids="$(backend_listener_pids || true)"
    if [[ -n "${listener_pids}" ]]; then
        echo "[backend] port ${BACKEND_WS_PORT} already in use by pid(s): $(echo "${listener_pids}" | format_pids_inline)"
        while IFS= read -r pid; do
            [[ -z "${pid}" ]] && continue
            local cmd
            cmd="$(ps -o cmd= -p "${pid}" 2>/dev/null || true)"
            [[ -n "${cmd}" ]] && echo "  - ${pid}: ${cmd}"
        done <<< "${listener_pids}"
        echo "[backend] run ./scripts/prod.sh stop (or ./scripts/dev.sh stop) to clean up lingering listeners."
        return 1
    fi

    (
        cd "${ROOT_DIR}/backend"
        if [[ -x "${ROOT_DIR}/backend/.venv/bin/python" ]]; then
            nohup setsid "${ROOT_DIR}/backend/.venv/bin/python" -m app.main >>"${BACKEND_LOG_FILE}" 2>&1 < /dev/null &
        else
            nohup setsid python -m app.main >>"${BACKEND_LOG_FILE}" 2>&1 < /dev/null &
        fi
        echo $! > "${BACKEND_PID_FILE}"
    )
    local pid
    pid="$(cat "${BACKEND_PID_FILE}")"
    sleep 0.4
    if is_pid_running "${pid}"; then
        echo "[backend] started (pid ${pid})"
    else
        rm -f "${BACKEND_PID_FILE}"
        echo "[backend] failed to stay running; check ${BACKEND_LOG_FILE}"
        return 1
    fi
}

ensure_frontend_build() {
    local electron_main="${ROOT_DIR}/frontend/dist-electron/main.cjs"
    local renderer_index="${ROOT_DIR}/frontend/dist/index.html"
    if [[ "${PROD_FRONTEND_REBUILD}" == "1" || ! -f "${electron_main}" || ! -f "${renderer_index}" ]]; then
        echo "[frontend] building production assets..."
        (
            cd "${ROOT_DIR}/frontend"
            npm run build >>"${FRONTEND_LOG_FILE}" 2>&1
        )
    fi
}

start_frontend() {
    cleanup_stale_pid_file "${FRONTEND_PID_FILE}"

    if [[ -f "${FRONTEND_PID_FILE}" ]] && is_pid_running "$(cat "${FRONTEND_PID_FILE}")"; then
        echo "[frontend] already running (pid $(cat "${FRONTEND_PID_FILE}"))"
        return
    fi

    local unmanaged_pids
    unmanaged_pids="$(frontend_prod_pids || true)"
    if [[ -n "${unmanaged_pids}" ]]; then
        echo "[frontend] production Electron appears to already be running (unmanaged pid(s): $(echo "${unmanaged_pids}" | format_pids_inline))"
        echo "[frontend] run ./scripts/prod.sh stop to clean up lingering processes."
        return 1
    fi

    if [[ ! -x "${ROOT_DIR}/frontend/node_modules/.bin/electron" ]]; then
        echo "[frontend] missing dependencies. Run: cd frontend && npm install"
        return 1
    fi

    ensure_frontend_build

    (
        cd "${ROOT_DIR}/frontend"
        nohup setsid env -u VITE_DEV_SERVER_URL NODE_ENV=production ./node_modules/.bin/electron dist-electron/main.cjs >>"${FRONTEND_LOG_FILE}" 2>&1 < /dev/null &
        echo $! > "${FRONTEND_PID_FILE}"
    )
    local pid
    pid="$(cat "${FRONTEND_PID_FILE}")"
    sleep 0.8
    if is_pid_running "${pid}"; then
        echo "[frontend] started (pid ${pid})"
    else
        rm -f "${FRONTEND_PID_FILE}"
        echo "[frontend] failed to stay running; check ${FRONTEND_LOG_FILE}"
        return 1
    fi
}

stop_service() {
    local name="$1"
    local pid_file="$2"
    local kill_mode="${3:-pid}"

    cleanup_stale_pid_file "${pid_file}"

    if [[ ! -f "${pid_file}" ]]; then
        echo "[${name}] not running"
        return
    fi

    local pid
    pid="$(cat "${pid_file}")"
    if ! is_pid_running "${pid}"; then
        rm -f "${pid_file}"
        echo "[${name}] not running"
        return
    fi

    local pgid
    pgid="$(pgid_for_pid "${pid}")"

    if [[ "${kill_mode}" == "group" ]] && [[ -n "${pgid}" ]]; then
        kill -- "-${pgid}" >/dev/null 2>&1 || true
    else
        kill "${pid}" >/dev/null 2>&1 || true
    fi

    local _i
    for _i in {1..30}; do
        if ! is_pid_running "${pid}"; then
            rm -f "${pid_file}"
            echo "[${name}] stopped"
            return
        fi
        sleep 0.2
    done

    if [[ "${kill_mode}" == "group" ]] && [[ -n "${pgid}" ]]; then
        kill -9 -- "-${pgid}" >/dev/null 2>&1 || true
    else
        kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${pid_file}"
    echo "[${name}] force stopped"
}

stop_backend() {
    stop_service "backend" "${BACKEND_PID_FILE}" "group"

    local listener_pids
    listener_pids="$(backend_listener_pids || true)"
    if [[ -z "${listener_pids}" ]]; then
        return
    fi

    echo "[backend] stopping lingering listener(s) on port ${BACKEND_WS_PORT}: $(echo "${listener_pids}" | format_pids_inline)"

    while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        is_pid_running "${pid}" && kill "${pid}" >/dev/null 2>&1 || true
    done <<< "${listener_pids}"

    local _i
    for _i in {1..30}; do
        listener_pids="$(backend_listener_pids || true)"
        if [[ -z "${listener_pids}" ]]; then
            echo "[backend] cleared lingering listener(s)"
            return
        fi
        sleep 0.2
    done

    while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        is_pid_running "${pid}" && kill -9 "${pid}" >/dev/null 2>&1 || true
    done <<< "${listener_pids}"
    echo "[backend] force cleared lingering listener(s)"
}

stop_frontend() {
    stop_service "frontend" "${FRONTEND_PID_FILE}" "group"

    local unmanaged_pids unmanaged_pgids
    unmanaged_pids="$(frontend_prod_pids || true)"
    if [[ -z "${unmanaged_pids}" ]]; then
        return
    fi

    unmanaged_pgids="$(pgids_for_pids "${unmanaged_pids}" || true)"
    echo "[frontend] stopping lingering production process(es): pid(s) $(echo "${unmanaged_pids}" | format_pids_inline)"

    if [[ -n "${unmanaged_pgids}" ]]; then
        while IFS= read -r pgid; do
            [[ -z "${pgid}" ]] && continue
            kill -- "-${pgid}" >/dev/null 2>&1 || true
        done <<< "${unmanaged_pgids}"
    else
        while IFS= read -r pid; do
            [[ -z "${pid}" ]] && continue
            is_pid_running "${pid}" && kill "${pid}" >/dev/null 2>&1 || true
        done <<< "${unmanaged_pids}"
    fi

    local _i
    for _i in {1..30}; do
        unmanaged_pids="$(frontend_prod_pids || true)"
        if [[ -z "${unmanaged_pids}" ]]; then
            echo "[frontend] cleared lingering production process(es)"
            return
        fi
        sleep 0.2
    done

    if [[ -n "${unmanaged_pgids}" ]]; then
        while IFS= read -r pgid; do
            [[ -z "${pgid}" ]] && continue
            kill -9 -- "-${pgid}" >/dev/null 2>&1 || true
        done <<< "${unmanaged_pgids}"
    else
        while IFS= read -r pid; do
            [[ -z "${pid}" ]] && continue
            is_pid_running "${pid}" && kill -9 "${pid}" >/dev/null 2>&1 || true
        done <<< "${unmanaged_pids}"
    fi
    echo "[frontend] force cleared lingering production process(es)"
}

print_status() {
    local backend_pid frontend_pid listener_pids frontend_process_pids
    backend_pid="$(read_pid "${BACKEND_PID_FILE}")"
    frontend_pid="$(read_pid "${FRONTEND_PID_FILE}")"
    listener_pids="$(backend_listener_pids || true)"
    frontend_process_pids="$(frontend_prod_pids || true)"

    if [[ -n "${backend_pid:-}" ]] && is_pid_running "${backend_pid}"; then
        echo "[backend] running (pid ${backend_pid})"
    elif [[ -n "${listener_pids}" ]]; then
        echo "[backend] running (unmanaged listener pid(s): $(echo "${listener_pids}" | format_pids_inline) on port ${BACKEND_WS_PORT})"
    else
        echo "[backend] stopped"
    fi

    if [[ -n "${frontend_pid:-}" ]] && is_pid_running "${frontend_pid}"; then
        echo "[frontend] running (pid ${frontend_pid})"
    elif [[ -n "${frontend_process_pids}" ]]; then
        echo "[frontend] running (unmanaged production pid(s): $(echo "${frontend_process_pids}" | format_pids_inline))"
    else
        echo "[frontend] stopped"
    fi
}

print_logs() {
    local lines="${1:-80}"
    echo "== backend (${BACKEND_LOG_FILE}) =="
    if [[ -f "${BACKEND_LOG_FILE}" ]]; then
        tail -n "${lines}" "${BACKEND_LOG_FILE}"
    else
        echo "No backend log yet."
    fi

    echo
    echo "== frontend (${FRONTEND_LOG_FILE}) =="
    if [[ -f "${FRONTEND_LOG_FILE}" ]]; then
        tail -n "${lines}" "${FRONTEND_LOG_FILE}"
    else
        echo "No frontend log yet."
    fi
}

usage() {
    cat <<USAGE_EOF
Usage: scripts/prod.sh <command>

Commands:
  start      Start backend + production Electron frontend
  stop       Stop backend and production frontend
  restart    Restart backend and production frontend
  status     Show backend/frontend process status
  logs [N]   Show last N lines from both logs (default: 80)

Environment overrides:
  BACKEND_WS_PORT=<port>      Port used for backend listener checks (default: 8765)
  PROD_FRONTEND_REBUILD=1     Force npm run build before starting frontend
USAGE_EOF
}

main() {
    local command="${1:-}"
    case "${command}" in
        start)
            start_backend
            start_frontend
            print_status
            ;;
        stop)
            stop_frontend
            stop_backend
            ;;
        restart)
            stop_frontend
            stop_backend
            start_backend
            start_frontend
            print_status
            ;;
        status)
            print_status
            ;;
        logs)
            print_logs "${2:-80}"
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
