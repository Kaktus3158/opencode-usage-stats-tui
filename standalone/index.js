import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  createCliRenderer,
  t,
  bold,
  dim,
  fg,
} from "@opentui/core"
import { getStats } from "./stats.js"
import { getLastUsed } from "./lastused.js"
// Общий модуль с плагином OpenCode: форматтеры и раскладка колонок
import {
  COL,
  formatAgo,
  formatClock,
  formatCompact,
  formatCost,
  formatCount,
  formatNumber,
  layoutColumns,
  modelLabel,
  padEnd,
  padStart,
  stripProvider,
  tokensTotal,
  truncate,
} from "../src/format.ts"

const REFRESH_MS = 60_000
const RANGE_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 8

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#0b0f1a",
})

let stats = null
let error = null
let lastUpdated = null
let lastUsed = new Map()
let refreshing = false
let refreshMs = REFRESH_MS
let refreshTimer = null
let clockTimer = null

const C = {
  bg: "#0b0f1a",
  panel: "#0f172a",
  panelBorder: "#1e293b",
  zebra: "#141c2a",
  text: "#e2e8f0",
  muted: "#64748b",
  accent: "#7dd3fc",
  success: "#86efac",
  warn: "#fbbf24",
  danger: "#f87171",
}

const root = new BoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  backgroundColor: C.bg,
  flexDirection: "column",
  padding: 1,
  gap: 1,
})

const header = new TextRenderable(renderer, {
  content: "OpenCode Usage",
  fg: C.accent,
  selectable: false,
})

const message = new TextRenderable(renderer, {
  content: "",
  fg: C.muted,
  selectable: false,
})

// Карточки сводки
const summary = new BoxRenderable(renderer, {
  width: "100%",
  flexDirection: "row",
  gap: 1,
  height: 6,
})

const statDefs = [
  {
    title: "REQUESTS",
    color: C.accent,
    hint: "запросов",
    get: (s) => s.steps ?? 0,
    fmt: formatNumber,
  },
  {
    title: "TOKENS",
    color: C.text,
    hint: "всего",
    get: (s) => tokensTotal(s.tokens),
    fmt: formatCompact,
  },
  {
    title: "INPUT",
    color: "#a5b4fc",
    hint: "входящих",
    get: (s) => s.tokens?.input ?? 0,
    fmt: formatCompact,
  },
  {
    title: "OUTPUT",
    color: C.success,
    hint: "исходящих",
    get: (s) => s.tokens?.output ?? 0,
    fmt: formatCompact,
  },
  {
    title: "CACHED",
    color: "#c4b5fd",
    hint: "из кеша",
    get: (s) => (s.tokens?.cache?.read ?? 0) + (s.tokens?.cache?.write ?? 0),
    fmt: formatCompact,
  },
  {
    title: "COST",
    color: C.warn,
    hint: "оценка",
    get: (s) => s.cost ?? 0,
    fmt: formatCost,
  },
]

const statValues = []

for (const def of statDefs) {
  const box = new BoxRenderable(renderer, {
    flexGrow: 1,
    height: 6,
    borderStyle: "rounded",
    borderColor: C.panelBorder,
    backgroundColor: C.panel,
    padding: 1,
    flexDirection: "column",
    justifyContent: "center",
    gap: 0,
    title: def.title,
    titleColor: def.color,
    titleAlignment: "left",
  })
  const value = new TextRenderable(renderer, {
    content: "0",
    fg: def.color,
    selectable: false,
    attributes: TextAttributes.BOLD,
  })
  const hint = new TextRenderable(renderer, {
    content: def.hint,
    fg: C.muted,
    selectable: false,
  })
  box.add(value)
  box.add(hint)
  summary.add(box)
  statValues.push({ el: value, hint, def })
}

// Модели
const modelsBox = new BoxRenderable(renderer, {
  width: "100%",
  borderStyle: "rounded",
  borderColor: C.panelBorder,
  backgroundColor: C.panel,
  padding: 1,
  flexDirection: "column",
  gap: 0,
  title: "MODELS · last 24h",
  titleColor: C.muted,
  titleAlignment: "left",
})

const modelsHeader = new TextRenderable(renderer, {
  content: "",
  fg: C.muted,
  selectable: false,
  wrapMode: "none",
  height: 1,
  flexShrink: 0,
})
modelsBox.add(modelsHeader)

const sepLine = new TextRenderable(renderer, {
  content: "",
  fg: C.panelBorder,
  selectable: false,
  wrapMode: "none",
  height: 1,
  flexShrink: 0,
})
modelsBox.add(sepLine)

const rowsBox = new BoxRenderable(renderer, {
  width: "100%",
  flexDirection: "column",
  gap: 1,
})
modelsBox.add(rowsBox)

const rowBoxes = []
const rowTexts = []
for (let i = 0; i < MAX_ROWS; i++) {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    height: 1,
    backgroundColor: i % 2 === 0 ? "transparent" : C.zebra,
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: "row",
    alignItems: "center",
  })
  const text = new TextRenderable(renderer, {
    content: "",
    fg: C.text,
    selectable: false,
    wrapMode: "none",
  })
  box.add(text)
  rowBoxes.push(box)
  rowTexts.push(text)
  rowsBox.add(box)
}

const totalSep = new TextRenderable(renderer, {
  content: "",
  fg: C.panelBorder,
  selectable: false,
  wrapMode: "none",
  height: 1,
  flexShrink: 0,
})
modelsBox.add(totalSep)

const totalText = new TextRenderable(renderer, {
  content: "",
  fg: C.text,
  selectable: false,
  wrapMode: "none",
  height: 1,
  flexShrink: 0,
  attributes: TextAttributes.BOLD,
})
modelsBox.add(totalText)

root.add(header)
root.add(message)
root.add(summary)
root.add(modelsBox)

// Статус-бар
const statusBar = new BoxRenderable(renderer, {
  position: "absolute",
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  backgroundColor: C.panel,
  paddingLeft: 1,
  paddingRight: 1,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const statusLeft = new TextRenderable(renderer, {
  content: "OpenCode Usage",
  fg: C.muted,
  selectable: false,
})

const statusRight = new TextRenderable(renderer, {
  content: "",
  fg: C.muted,
  selectable: false,
})

statusBar.add(statusLeft)
statusBar.add(statusRight)
renderer.root.add(root)
renderer.root.add(statusBar)

function render() {
  const available = (renderer.width || 100) - 6
  const reqWidth = COL.req
  const tokensWidth = COL.tokens
  const inputWidth = COL.input
  const outputWidth = COL.output
  const cachedWidth = COL.cached
  const costWidth = COL.cost

  if (stats) {
    const range = stats.range ?? {}
    const d = new Date(range.from ?? 0)
    const dateStr = d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

    header.content = t`${bold(fg(C.accent)("OpenCode Usage"))} ${dim(
      `· ${dateStr} · ${formatClock(range.from)}–${formatClock(range.to)}`
    )}`
    message.content = ""
    message.visible = false

    // Карточки сводки
    for (let i = 0; i < statDefs.length; i++) {
      const def = statDefs[i]
      statValues[i].el.content = t`${bold(fg(def.color)(def.fmt(def.get(stats))))}`
    }

    // Таблица моделей
    const models = stats.models ?? []

    // Сортировка по последнему использованию (данные из локальной БД OpenCode).
    // Если БД недоступна — остаётся сортировка API (по количеству шагов).
    const sorted =
      lastUsed.size > 0
        ? [...models].sort((a, b) => {
            const la = lastUsed.get(modelLabel(a.model)) ?? 0
            const lb = lastUsed.get(modelLabel(b.model)) ?? 0
            if (la !== lb) return lb - la
            return (b.steps ?? 0) - (a.steps ?? 0)
          })
        : models

    // Сколько строк моделей помещается по высоте терминала.
    // Раскладка сверху: 1 (padding) + 1 (шапка) + 1 (gap) + 6 (карточки) + 1 (gap) = 10,
    // снизу: 1 (padding) + 1 (статус-бар) = 2.
    // Панель моделей: 4 (border+padding) + 4 (служебные строки) + 2N-1 (модели через gap) = 2N+7.
    const termHeight = renderer.height || 24
    const boxAvailable = termHeight - 12
    const maxVisible = Math.max(
      1,
      Math.min(MAX_ROWS, Math.floor((boxAvailable - 7) / 2))
    )
    const shown = sorted.slice(0, maxVisible)

    // Общий провайдер — убираем его из имени, если он у всех один
    const providers = new Set(shown.map((m) => m.model?.providerID ?? ""))
    const commonProvider = providers.size === 1 ? [...providers][0] : null

    const labels = shown.map((m) => stripProvider(modelLabel(m.model), commonProvider))
    const longest = labels.reduce((a, l) => Math.max(a, l.length), 5)
    const { modelWidth, gap, gapWidth } = layoutColumns(longest, renderer.width || 100)

    const headerRow =
      padEnd("MODEL", modelWidth) +
      gap +
      padStart("REQ", reqWidth) +
      gap +
      padStart("TOKENS", tokensWidth) +
      gap +
      padStart("INPUT", inputWidth) +
      gap +
      padStart("OUTPUT", outputWidth) +
      gap +
      padStart("CACHED", cachedWidth) +
      gap +
      padStart("COST", costWidth)

    modelsHeader.content = t`${fg(C.muted)(headerRow)}`
    sepLine.content = "─".repeat(available)
    modelsBox.title =
      lastUsed.size > 0 ? "MODELS · по последнему использованию" : "MODELS · last 24h"

    let sumSteps = 0
    let sumTokens = 0
    let sumInput = 0
    let sumOutput = 0
    let sumCached = 0
    let sumCost = 0

    // Итоги считаем по всем моделям, а не только по показанным
    for (const m of sorted) {
      sumSteps += m.steps ?? 0
      sumTokens += tokensTotal(m.tokens)
      sumInput += m.tokens?.input ?? 0
      sumOutput += m.tokens?.output ?? 0
      sumCached += (m.tokens?.cache?.read ?? 0) + (m.tokens?.cache?.write ?? 0)
      sumCost += m.cost ?? 0
    }

    for (let i = 0; i < MAX_ROWS; i++) {
      const box = rowBoxes[i]
      const text = rowTexts[i]
      const m = shown[i]
      if (!m) {
        box.visible = false
        text.visible = false
        continue
      }
      box.visible = true
      text.visible = true

      const label = padEnd(truncate(labels[i], modelWidth), modelWidth)
      const steps = padStart(formatCount(m.steps ?? 0), reqWidth)
      const tokTotal = tokensTotal(m.tokens)
      const tokens = padStart(formatCompact(tokTotal), tokensWidth)
      const input = padStart(formatCompact(m.tokens?.input ?? 0), inputWidth)
      const output = padStart(formatCompact(m.tokens?.output ?? 0), outputWidth)
      const cached = padStart(
        formatCompact((m.tokens?.cache?.read ?? 0) + (m.tokens?.cache?.write ?? 0)),
        cachedWidth
      )
      const cost = padStart(formatCost(m.cost), costWidth)
      const isTop = i === 0
      const labelColor = isTop ? C.accent : C.text

      text.content = t`${fg(labelColor)(label)}${gap}${fg(C.text)(
        steps
      )}${gap}${fg(C.text)(tokens)}${gap}${fg("#a5b4fc")(input)}${gap}${fg(
        C.success
      )(output)}${gap}${fg("#c4b5fd")(cached)}${gap}${fg(C.warn)(cost)}`
    }

    // Итоговая строка
    totalSep.content = "─".repeat(available)
    totalText.content = t`${bold(
      fg(C.accent)(padEnd("TOTAL", modelWidth))
    )}${gap}${bold(fg(C.text)(padStart(formatCount(sumSteps), reqWidth)))}${gap}${bold(
      fg(C.text)(padStart(formatCompact(sumTokens), tokensWidth))
    )}${gap}${bold(
      fg("#a5b4fc")(padStart(formatCompact(sumInput), inputWidth))
    )}${gap}${bold(
      fg(C.success)(padStart(formatCompact(sumOutput), outputWidth))
    )}${gap}${bold(
      fg("#c4b5fd")(padStart(formatCompact(sumCached), cachedWidth))
    )}${gap}${bold(fg(C.warn)(padStart(formatCost(sumCost), costWidth)))}`

  } else {
    header.content = t`${bold(fg(C.accent)("OpenCode Usage"))} ${dim(
      "· last 24h"
    )}`
    modelsHeader.content = ""
    sepLine.content = ""
    totalSep.content = ""
    totalText.content = ""
    for (const box of rowBoxes) {
      box.visible = false
    }
    if (error) {
      message.content = t`${fg(C.danger)(error)}`
      message.visible = true
    } else if (refreshing) {
      message.content = t`${fg(C.muted)("⟳ загрузка…")}`
      message.visible = true
    } else {
      message.content = t`${fg(C.muted)("Загрузка…")}`
      message.visible = true
    }
  }

  // Статус-бар
  if (lastUpdated) {
    const ago = formatAgo(Date.now() - lastUpdated)
    statusLeft.content = t`${fg(C.success)("●")} ${fg(C.muted)(`обновлено ${ago}`)}`
    statusRight.content = t`${fg(C.muted)(
      `каждые ${Math.round(refreshMs / 1000)} сек · r — обновить · q — выход`
    )}`
  } else {
    statusLeft.content = t`${fg(C.warn)("●")} ${fg(C.muted)("нет данных")}`
    statusRight.content = t`${fg(C.muted)(
      `каждые ${Math.round(refreshMs / 1000)} сек · r — обновить · q — выход`
    )}`
  }
}

async function refresh() {
  refreshing = true
  render()
  try {
    stats = await getStats(RANGE_MS)
    error = null
    lastUpdated = Date.now()
    lastUsed = getLastUsed()
  } catch (e) {
    stats = null
    error = e instanceof Error ? e.message : String(e)
  } finally {
    refreshing = false
  }
  render()
}

function setRefreshInterval(ms) {
  refreshMs = ms
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(refresh, refreshMs)
  render()
}

// Русская раскладка: q → й, r → к
const KEY_ALIASES = {
  q: "q",
  й: "q",
  r: "r",
  к: "r",
  "+": "+",
  "=": "+",
  "-": "-",
  _: "-",
}

renderer.keyInput.on("keypress", (key) => {
  try {
    const name = KEY_ALIASES[key.name] ?? key.name
    if (name === "q") {
      renderer.destroy()
      return
    }
    if (name === "r") {
      refresh()
      return
    }
    if (name === "+") {
      setRefreshInterval(Math.max(5_000, refreshMs - 5_000))
      return
    }
    if (name === "-") {
      setRefreshInterval(Math.min(600_000, refreshMs + 5_000))
    }
  } catch (e) {
    // ignore key handling errors
  }
})

renderer.once("destroy", () => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (clockTimer) clearInterval(clockTimer)
})

refreshTimer = setInterval(refresh, refreshMs)
clockTimer = setInterval(render, 1000)
refresh()
