import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function opencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN
  const npmGlobal = join(process.env.APPDATA ?? "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
  if (existsSync(npmGlobal)) return npmGlobal
  return "opencode"
}

function servicePassword() {
  const cfgPath = join(homedir(), ".config", "opencode", "service.json")
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"))
  if (!cfg.password) throw new Error("service.json: нет password")
  return cfg.password
}

async function serverUrl() {
  if (process.env.OPENCODE_API_URL) return process.env.OPENCODE_API_URL.replace(/\/$/, "")
  const { stdout } = await execFileAsync(opencodeBin(), ["api", "get", "/api/info"], {
    timeout: 10_000,
    windowsHide: true,
  })
  const info = JSON.parse(stdout)
  const url = info.urls?.[0]
  if (!url) throw new Error("opencode api: не удалось получить URL сервера")
  return url.replace(/\/$/, "")
}

export async function getStats(rangeMs = 24 * 60 * 60 * 1000) {
  const baseUrl = await serverUrl()
  const password = servicePassword()
  const to = Date.now()
  const from = to - rangeMs
  const url = `${baseUrl}/api/experimental/session/stats?from=${from}&to=${to}&tools=none`
  const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
  const res = await fetch(url, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const json = await res.json()
  if (!json.data) throw new Error("API вернул пустой data")
  return json.data
}
