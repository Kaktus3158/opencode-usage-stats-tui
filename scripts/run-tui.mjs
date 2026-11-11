// Запускает TUI OpenCode на странице плагина и сохраняет вывод для разбора.
// node scripts/run-tui.mjs [route] [workdir]
import { spawn } from "node:child_process"
import { createWriteStream, readFileSync } from "node:fs"
import { join } from "node:path"

const bin = join(process.env.APPDATA ?? "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
const route = process.argv[2] ?? "usage-tokens"
const workdir = process.argv[3] ?? process.cwd()
const out = createWriteStream("tui-run.log")

const child = spawn(bin, [], {
  cwd: workdir,
  env: {
    ...process.env,
    OPENCODE_ROUTE: JSON.stringify({ type: "plugin", id: "usage.stats", name: route }),
    OPENCODE_LOG_LEVEL: "INFO",
  },
  stdio: ["pipe", "pipe", "pipe"],
})

child.stdout.pipe(out)
child.stderr.pipe(out)

setTimeout(() => {
  child.kill()
  setTimeout(() => {
    console.log("вывод:", readFileSync("tui-run.log").length, "байт")
    process.exit(0)
  }, 500)
}, 12000)
