import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import {
  COL,
  formatAgo,
  formatClock,
  formatCompact,
  formatCost,
  formatDate,
  formatNumber,
  layoutColumns,
  padEnd,
  padStart,
  parseDate,
  stripProvider,
  truncate,
} from "./format.js"
import {
  fetchBreakdown,
  fetchUsage,
  rangeLabel,
  resolveRange,
  RANGE_PRESETS,
  type Breakdown,
  type RangePresetId,
  type RangeSelection,
  type UsageSnapshot,
} from "./data.js"

const REFRESH_MS = 60_000

type Route = ReturnType<Plugin.Context["ui"]["router"]["current"]>
type View = "models" | "sessions" | "days"

const VIEW_LABEL: Record<View, string> = {
  models: "модели",
  sessions: "сессии",
  days: "дни",
}

/** Заголовок колонки названий в каждом виде. */
const VIEW_TITLE: Record<View, string> = {
  models: "MODEL",
  sessions: "SESSION",
  days: "DATE",
}

export default Plugin.define({
  id: "usage.stats",
  setup(context) {
    const [snapshot, setSnapshot] = createSignal<UsageSnapshot | undefined>()
    const [breakdown, setBreakdown] = createSignal<Breakdown | undefined>()
    const [error, setError] = createSignal<string | undefined>()
    const [now, setNow] = createSignal(Date.now())
    // Маршрут, с которого открыли страницу — на него возвращает escape
    const [previous, setPrevious] = createSignal<Route>({ type: "home" })
    // Выбранный диапазон и режим отображения
    const [range, setRange] = createSignal<RangeSelection>({ preset: "24h" })
    const [view, setView] = createSignal<View>("models")

    const load = async () => {
      const current = range()
      // Оба набора запрашиваются вместе и применяются разом: иначе ширина
      // колонок менялась бы после загрузки, и таблица «прыгала» бы на экране
      const [stats, breakdown] = await Promise.allSettled([
        fetchUsage(context.client, current),
        fetchBreakdown(context.client, current),
      ])
      if (stats.status === "rejected") {
        setError(stats.reason instanceof Error ? stats.reason.message : String(stats.reason))
        return
      }
      setSnapshot(stats.value)
      setError(undefined)
      if (breakdown.status === "fulfilled") setBreakdown(breakdown.value)
    }

    void load()
    const refreshTimer = setInterval(() => void load(), REFRESH_MS)
    const clockTimer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => {
      clearInterval(refreshTimer)
      clearInterval(clockTimer)
    })

    // Полноэкранная страница со статистикой.
    // Имя "usage" занято встроенным маршрутом /usage, поэтому используем "usage-tokens".
    context.ui.router.register({
      name: "usage-tokens",
      render: () => (
        <UsagePage
          context={context}
          snapshot={snapshot}
          breakdown={breakdown}
          error={error}
          now={now}
          reload={load}
          range={range}
          setRange={setRange}
          view={view}
          setView={setView}
          onClose={() => context.ui.router.navigate(previous())}
        />
      ),
    })

    // Команда открытия страницы.
    // Встроенные /usage (модели и лимиты) и /stats (постер OpenCode) уже заняты,
    // поэтому наша команда называется /tokens.
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "usage.tokens.open",
          title: "Token usage (24h)",
          description: "Запросы и токены за последние 24 часа",
          group: "System",
          palette: true,
          slash: { name: "tokens" },
          run() {
            const current = context.ui.router.current()
            if (current.type === "plugin" && current.name === "usage-tokens") return
            // Запоминаем маршрут, с которого открываем страницу, чтобы вернуться по escape.
            // Копия нужна, потому что роутер отдаёт мутируемый объект текущего маршрута.
            setPrevious({ ...current })
            context.ui.dialog.clear()
            context.ui.router.navigate({ type: "plugin", name: "usage-tokens" })
          },
        },
      ],
    }))
  },
})

function UsagePage(props: {
  context: Plugin.Context
  snapshot: () => UsageSnapshot | undefined
  breakdown: () => Breakdown | undefined
  error: () => string | undefined
  now: () => number
  reload: () => Promise<void>
  range: () => RangeSelection
  setRange: (value: RangeSelection) => void
  view: () => View
  setView: (value: View) => void
  onClose: () => void
}) {
  const theme = props.context.theme
  const dimensions = useTerminalDimensions()
  const width = () => Math.max(40, dimensions().width - 6)

  props.context.keymap.layer(() => ({
    commands: [
      { id: "usage.reload", bind: "r", title: "Обновить", run: () => void props.reload() },
      {
        id: "usage.view",
        bind: "v",
        title: "Вид: модели / сессии / дни",
        run() {
          const order: View[] = ["models", "sessions", "days"]
          props.setView(order[(order.indexOf(props.view()) + 1) % order.length])
        },
      },
      {
        id: "usage.range",
        bind: "d",
        title: "Выбрать период",
        run() {
          void pickRange(props.context, props.range(), props.setRange).then((changed) => {
            if (changed) void props.reload()
          })
        },
      },
      {
        id: "usage.back",
        bind: "escape",
        title: "Назад",
        run: props.onClose,
      },
    ],
  }))

  const stats = createMemo(() => props.snapshot())
  const sessions = createMemo(() => props.breakdown()?.sessions ?? [])
  const days = createMemo(() => props.breakdown()?.days ?? [])

  // Общий провайдер убирается из имён моделей — он у всех одинаковый
  const modelLabels = createMemo(() => {
    const snapshot = stats()
    if (!snapshot) return []
    const providers = new Set(snapshot.models.map((m) => m.providerID))
    const common = providers.size === 1 ? [...providers][0] : null
    return snapshot.models.map((m) => stripProvider(m.label, common))
  })

  /**
   * Общая раскладка для всех видов.
   *
   * Ширина колонки названий считается по самым длинным названиям среди всех
   * таблиц страницы, поэтому числовые колонки стоят на одних и тех же местах
   * в каждом виде: и ширина колонки, и расстояние между колонками совпадают.
   */
  const layout = createMemo(() => {
    const longest = [
      ...modelLabels(),
      ...sessions().map((s) => s.title),
      ...days().map((d) => d.date),
    ].reduce((max, label) => Math.max(max, label.length), 5)
    const { modelWidth, gap } = layoutColumns(longest, width())
    return { modelWidth, gap }
  })

  const headerRow = createMemo(() => {
    const { modelWidth, gap } = layout()
    return (
      padEnd(VIEW_TITLE[props.view()], modelWidth) +
      gap +
      padStart("REQ", COL.req) +
      gap +
      padStart("TOKENS", COL.tokens) +
      gap +
      padStart("INPUT", COL.input) +
      gap +
      padStart("OUTPUT", COL.output) +
      gap +
      padStart("CACHED", COL.cached) +
      gap +
      padStart("COST", COL.cost)
    )
  })

  const range = createMemo(() => {
    const snapshot = stats()
    if (!snapshot) return ""
    const resolved = resolveRange(props.range(), snapshot.range.to)
    const from = new Date(resolved.from)
    const date = from.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    return `${date} · ${formatClock(resolved.from)}–${formatClock(resolved.to)}`
  })

  const cardDefs = createMemo(() => {
    const snapshot = stats()
    if (!snapshot) return []
    return [
      { title: "REQUESTS", value: formatNumber(snapshot.steps), hint: "запросов", color: theme.text.action.primary.base },
      { title: "TOKENS", value: formatCompact(snapshot.tokens), hint: "всего", color: theme.text.base },
      { title: "INPUT", value: formatCompact(snapshot.input), hint: "входящих", color: theme.text.base },
      { title: "OUTPUT", value: formatCompact(snapshot.output), hint: "исходящих", color: theme.text.base },
      { title: "CACHED", value: formatCompact(snapshot.cached), hint: "из кеша", color: theme.text.muted },
      { title: "COST", value: formatCost(snapshot.cost), hint: "оценка", color: theme.text.base },
    ]
  })

  const separator = createMemo(() => "─".repeat(Math.max(10, width() - 2)))

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.background.base}>
      <box width="100%" flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
          OpenCode Usage
        </text>
        <text fg={theme.text.muted}>{range()}</text>
      </box>

      <Show when={props.error()}>
        {(message) => (
          <box paddingLeft={1} paddingRight={1} marginTop={1}>
            <text fg={theme.text.feedback.error.base}>Не удалось загрузить статистику: {message()}</text>
          </box>
        )}
      </Show>

      <Show when={!props.error() && stats()}>
        <box width="100%" flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <box width="100%" flexDirection="row" gap={1} marginTop={1}>
            <For each={cardDefs()}>
              {(card) => (
                <box
                  flexGrow={1}
                  flexDirection="column"
                  borderStyle="rounded"
                  borderColor={theme.border.base}
                  backgroundColor={theme.background.raised.base}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={theme.text.muted}>{card.title}</text>
                  <text fg={card.color} attributes={TextAttributes.BOLD}>
                    {card.value}
                  </text>
                  <text fg={theme.text.faint}>{card.hint}</text>
                </box>
              )}
            </For>
          </box>

          <box flexDirection="column" marginTop={1}>
            <text fg={theme.text.muted}>{headerRow()}</text>
            <text fg={theme.border.base}>{separator()}</text>

            <Show when={props.view() === "models"}>
              <For each={stats()?.models ?? []}>
                {(model, index) => (
                  <text fg={theme.text.base}>
                    {padEnd(truncate(modelLabels()[index()] ?? "", layout().modelWidth), layout().modelWidth)}
                    {layout().gap}
                    {padStart(formatNumber(model.steps), COL.req)}
                    {layout().gap}
                    {padStart(formatCompact(model.tokens), COL.tokens)}
                    {layout().gap}
                    {padStart(formatCompact(model.input), COL.input)}
                    {layout().gap}
                    {padStart(formatCompact(model.output), COL.output)}
                    {layout().gap}
                    {padStart(formatCompact(model.cached), COL.cached)}
                    {layout().gap}
                    {padStart(formatCost(model.cost), COL.cost)}
                  </text>
                )}
              </For>
            </Show>

            <Show when={props.view() === "sessions"}>
              <For each={sessions()}>
                {(session) => (
                  <text fg={theme.text.base}>
                    {padEnd(truncate(session.title, layout().modelWidth), layout().modelWidth)}
                    {layout().gap}
                    {padStart(formatNumber(session.steps), COL.req)}
                    {layout().gap}
                    {padStart(formatCompact(session.tokens), COL.tokens)}
                    {layout().gap}
                    {padStart(formatCompact(session.input), COL.input)}
                    {layout().gap}
                    {padStart(formatCompact(session.output), COL.output)}
                    {layout().gap}
                    {padStart(formatCompact(session.cached), COL.cached)}
                    {layout().gap}
                    {padStart(formatCost(session.cost), COL.cost)}
                  </text>
                )}
              </For>
            </Show>

            <Show when={props.view() === "days"}>
              <For each={days()}>
                {(day) => (
                  <text fg={theme.text.base}>
                    {padEnd(truncate(day.date, layout().modelWidth), layout().modelWidth)}
                    {layout().gap}
                    {padStart(formatNumber(day.steps), COL.req)}
                    {layout().gap}
                    {padStart(formatCompact(day.tokens), COL.tokens)}
                    {layout().gap}
                    {padStart(formatCompact(day.input), COL.input)}
                    {layout().gap}
                    {padStart(formatCompact(day.output), COL.output)}
                    {layout().gap}
                    {padStart(formatCompact(day.cached), COL.cached)}
                    {layout().gap}
                    {padStart(formatCost(day.cost), COL.cost)}
                  </text>
                )}
              </For>
            </Show>

            <Show when={props.view() === "models" && stats()}>
              {(snapshot) => (
                <>
                  <text fg={theme.border.base}>{separator()}</text>
                  <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
                    {padEnd("TOTAL", layout().modelWidth)}
                    {layout().gap}
                    {padStart(formatNumber(snapshot().steps), COL.req)}
                    {layout().gap}
                    {padStart(formatCompact(snapshot().tokens), COL.tokens)}
                    {layout().gap}
                    {padStart(formatCompact(snapshot().input), COL.input)}
                    {layout().gap}
                    {padStart(formatCompact(snapshot().output), COL.output)}
                    {layout().gap}
                    {padStart(formatCompact(snapshot().cached), COL.cached)}
                    {layout().gap}
                    {padStart(formatCost(snapshot().cost), COL.cost)}
                  </text>
                </>
              )}
            </Show>

            <Show when={props.view() === "sessions" && sessions().length > 0}>
              <text fg={theme.border.base}>{separator()}</text>
              <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
                {padEnd("TOTAL", layout().modelWidth)}
                {layout().gap}
                {padStart(formatNumber(sessions().reduce((a, s) => a + s.steps, 0)), COL.req)}
                {layout().gap}
                {padStart(formatCompact(sessions().reduce((a, s) => a + s.tokens, 0)), COL.tokens)}
                {layout().gap}
                {padStart(formatCompact(sessions().reduce((a, s) => a + s.input, 0)), COL.input)}
                {layout().gap}
                {padStart(formatCompact(sessions().reduce((a, s) => a + s.output, 0)), COL.output)}
                {layout().gap}
                {padStart(formatCompact(sessions().reduce((a, s) => a + s.cached, 0)), COL.cached)}
                {layout().gap}
                {padStart(formatCost(sessions().reduce((a, s) => a + s.cost, 0)), COL.cost)}
              </text>
            </Show>

            <Show when={props.view() === "days" && days().length > 0}>
              <text fg={theme.border.base}>{separator()}</text>
              <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
                {padEnd("TOTAL", layout().modelWidth)}
                {layout().gap}
                {padStart(formatNumber(days().reduce((a, d) => a + d.steps, 0)), COL.req)}
                {layout().gap}
                {padStart(formatCompact(days().reduce((a, d) => a + d.tokens, 0)), COL.tokens)}
                {layout().gap}
                {padStart(formatCompact(days().reduce((a, d) => a + d.input, 0)), COL.input)}
                {layout().gap}
                {padStart(formatCompact(days().reduce((a, d) => a + d.output, 0)), COL.output)}
                {layout().gap}
                {padStart(formatCompact(days().reduce((a, d) => a + d.cached, 0)), COL.cached)}
                {layout().gap}
                {padStart(formatCost(days().reduce((a, d) => a + d.cost, 0)), COL.cost)}
              </text>
            </Show>
          </box>
        </box>
      </Show>

      <box width="100%" flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={theme.text.muted}>
          {stats() ? `обновлено ${formatAgo(props.now() - stats()!.fetchedAt)}` : "загрузка…"}
        </text>
        <text fg={theme.text.faint}>
          {VIEW_LABEL[props.view()]} · {rangeLabel(props.range())} · r — обновить · v — вид · d — период · esc — назад
        </text>
      </box>
    </box>
  )
}

/**
 * Диалог выбора периода.
 *
 * Сначала предлагаются готовые диапазоны, затем — произвольные даты.
 * Возвращает true, если период изменился.
 */
async function pickRange(
  context: Plugin.Context,
  current: RangeSelection,
  apply: (value: RangeSelection) => void,
): Promise<boolean> {
  const preset = await context.ui.dialog.select<RangePresetId | "custom">({
    title: "Период статистики",
    options: [
      ...RANGE_PRESETS.map((p) => ({ title: p.label, value: p.id as RangePresetId })),
      { title: "Свои даты…", value: "custom" as const },
    ],
  })
  if (preset === undefined) return false
  if (preset !== "custom") {
    if (current.preset === preset) return false
    apply({ preset })
    return true
  }

  // Произвольный диапазон: спрашиваем даты по очереди
  const fromInput = await context.ui.dialog.prompt({
    title: "Начало периода",
    description: "Формат: ДД.ММ.ГГГГ (например, 01.11.2026)",
    placeholder: "01.11.2026",
  })
  if (fromInput === undefined) return false
  const from = parseDate(fromInput)
  if (from === undefined) {
    await context.ui.dialog.alert({
      title: "Некорректная дата",
      message: `Не удалось разобрать «${fromInput}». Ожидается формат ДД.ММ.ГГГГ.`,
    })
    return false
  }

  const toInput = await context.ui.dialog.prompt({
    title: "Конец периода",
    description: "Формат: ДД.ММ.ГГГГ (например, 11.11.2026). День включается целиком.",
    placeholder: formatDate(Date.now()),
  })
  if (toInput === undefined) return false
  const toStart = parseDate(toInput)
  if (toStart === undefined) {
    await context.ui.dialog.alert({
      title: "Некорректная дата",
      message: `Не удалось разобрать «${toInput}». Ожидается формат ДД.ММ.ГГГГ.`,
    })
    return false
  }
  // Конец периода включается целиком: сдвигаем на последнюю миллисекунду суток
  const to = toStart + 24 * 60 * 60 * 1000 - 1
  if (to < from) {
    await context.ui.dialog.alert({
      title: "Неверный диапазон",
      message: "Конец периода раньше начала.",
    })
    return false
  }

  apply({ custom: { from, to } })
  return true
}
