// Восстанавливает текстовый экран из ANSI-вывода opentui (для визуальной проверки вёрстки)
import { readFileSync } from "node:fs"

const raw = readFileSync(process.argv[2] ?? "run.log", "utf8")
const grid = new Map()
let row = 1
let col = 1

function put(ch) {
  if (!grid.has(row)) grid.set(row, new Map())
  grid.get(row).set(col, ch)
  col++
}

let i = 0
while (i < raw.length) {
  const ch = raw[i]
  if (ch === "\x1b") {
    // OSC: ESC ] ... BEL или ESC \  (терминальные настройки, пропускаем)
    if (raw[i + 1] === "]") {
      let j = i + 2
      while (j < raw.length && raw[j] !== "\x07" && !(raw[j] === "\x1b" && raw[j + 1] === "\\")) j++
      i = raw[j] === "\x07" ? j + 1 : j + 2
      continue
    }
    // CSI: ESC [ ... final
    if (raw[i + 1] === "[") {
      let j = i + 2
      while (j < raw.length && !/[A-Za-z]/.test(raw[j])) j++
      const params = raw.slice(i + 2, j)
      const cmd = raw[j]
      if (cmd === "H") {
        const [r, c] = params.split(";").map((n) => parseInt(n || "1", 10))
        row = Number.isFinite(r) && r > 0 ? r : 1
        col = Number.isFinite(c) && c > 0 ? c : 1
      }
      i = j + 1
      continue
    }
    // прочие escape — пропускаем 2 символа
    i += 2
    continue
  }
  if (ch === "\n") {
    row++
    col = 1
    i++
    continue
  }
  if (ch === "\r") {
    col = 1
    i++
    continue
  }
  if (ch === "\x07") {
    i++
    continue
  }
  put(ch)
  i++
}

const maxRow = grid.size ? Math.max(...grid.keys()) : 0
for (let r = 1; r <= maxRow; r++) {
  const line = grid.get(r)
  if (!line) {
    console.log("")
    continue
  }
  const maxCol = Math.max(...line.keys())
  let out = ""
  for (let c = 1; c <= maxCol; c++) out += line.get(c) ?? " "
  console.log(out.replace(/\s+$/, ""))
}
