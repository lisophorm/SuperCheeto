import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const loadEnvb = () => {
  const envbPath = path.resolve(process.cwd(), '.envb')
  if (!fs.existsSync(envbPath)) {
    return
  }
  const lines = fs.readFileSync(envbPath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line
    const equalsIndex = normalizedLine.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }
    const key = normalizedLine.slice(0, equalsIndex).trim()
    let value = normalizedLine.slice(equalsIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvb()

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
})
