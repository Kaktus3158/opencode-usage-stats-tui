// Прогоняет клавиши в TUI и сохраняет снимки экрана — для проверки плагина.
// node scripts/run-keys.mjs <клавиши через +, например v или v,v> [workdir]
import { spawn } from "node:child_process"
import { createWriteStream, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const bin = join(process.env.APPDATA ?? "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
const keys = (process.argv[2] ?? "").split("+").filter(Boolean)
const workdir = process.argv[3] ?? process.cwd()
const out = createWriteStream("keys.log")

const child = spawn(bin, [], {
  cwd: workdir,
  env: {
    ...process.env,
    OPENCODE_ROUTE: JSON.stringify({ type: "plugin", id: "usage.stats", name: "usage-tokens" }),
    OPENCODE_LOG_LEVEL: "INFO",
  },
  stdio: ["pipe", "pipe", "pipe"],
})

child.stdout.pipe(out)
child.stderr.pipe(out)

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const KEYS = { v: "v", d: "d", r: "r", esc: "\x1b" }

await wait(9000)
let index = 0
writeFileSync(`screen-${index}-start.log`, readFileSync("keys.log", "utf8"))
index++
for (const key of keys) {
  child.stdin.write(KEYS[key] ?? key)
  await wait(4000)
  writeFileSync(`screen-${index}-${key}.log`, readFileSync("keys.log", "utf8"))
  index++
}

child.kill()
await wait(500)
console.log("снимков:", index)
process.exit(0)
