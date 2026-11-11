// Доступ к данным OpenCode из TUI-плагина.
//
// Источники:
//   * client.experimental.session.stats — агрегаты по моделям и итоги за диапазон;
//   * client.session.list + client.message.list — данные по сессиям.
//
// Время последнего использования модели статистика не отдаёт, поэтому оно
// собирается из истории переключений: сообщение "model-switched" означает, что
// в момент time.created модель previous была заменена на model. Значит
// previous использовалась последний раз ровно в этот момент, а model —
// начиная с него. Текущая модель сессии используется до time.updated сессии.

import type { OpenCodeClient } from "@opencode/client"
import { modelLabel, tokensTotal } from "./format.js"

export interface StatsModel {
  readonly label: string
  readonly providerID: string
  readonly steps: number
  readonly tokens: number
  readonly input: number
  readonly output: number
  readonly cached: number
  readonly cost: number
  readonly lastUsed: number
}

export interface SessionUsage {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly steps: number
  readonly tokens: number
  readonly input: number
  readonly output: number
  readonly cached: number
  readonly cost: number
  readonly models: readonly string[]
  readonly lastUsed: number
}

export interface DayUsage {
  /** Дата в локальном времени в формате ДД.ММ.ГГГГ. */
  readonly date: string
  readonly steps: number
  readonly tokens: number
  readonly input: number
  readonly output: number
  readonly cached: number
  readonly cost: number
  readonly lastUsed: number
}

export interface Breakdown {
  readonly sessions: readonly SessionUsage[]
  readonly days: readonly DayUsage[]
}

export interface UsageSnapshot {
  readonly range: { readonly from: number; readonly to: number }
  readonly sessions: number
  readonly steps: number
  readonly tokens: number
  readonly input: number
  readonly output: number
  readonly cached: number
  readonly cost: number
  readonly models: readonly StatsModel[]
  readonly fetchedAt: number
}

export const RANGE_MS = 24 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

/** Готовые диапазоны: последние 24 часа, 7 дней, 30 дней. */
export const RANGE_PRESETS = [
  { id: "24h", label: "24 часа", ms: DAY_MS },
  { id: "7d", label: "7 дней", ms: 7 * DAY_MS },
  { id: "30d", label: "30 дней", ms: 30 * DAY_MS },
] as const

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"]

/** Произвольный диапазон: от/до в миллисекундах. */
export interface CustomRange {
  readonly from: number
  readonly to: number
}

export interface RangeSelection {
  readonly preset?: RangePresetId
  readonly custom?: CustomRange
}

/** Диапазон, готовый к запросу: абсолютные границы в миллисекундах. */
export interface ResolvedRange {
  readonly from: number
  readonly to: number
}

/** Приводит выбор диапазона к абсолютным границам. */
export function resolveRange(
  selection: RangeSelection,
  now = Date.now(),
): ResolvedRange {
  if (selection.custom) {
    return { from: selection.custom.from, to: selection.custom.to }
  }
  const preset = RANGE_PRESETS.find((p) => p.id === selection.preset) ?? RANGE_PRESETS[0]
  return { from: now - preset.ms, to: now }
}

/** Человеческое название выбранного диапазона. */
export function rangeLabel(selection: RangeSelection, now = Date.now()): string {
  if (selection.custom) return "свой диапазон"
  const preset = RANGE_PRESETS.find((p) => p.id === selection.preset) ?? RANGE_PRESETS[0]
  void now
  return preset.label
}

/**
 * Время последнего использования каждой модели.
 *
 * Статистика его не отдаёт, поэтому оно собирается из истории переключений:
 * сообщение "model-switched" означает, что в момент time.created модель
 * previous была заменена на model. Значит previous использовалась последний
 * раз ровно в этот момент, а model — начиная с него.
 * Текущая модель сессии используется до time.updated сессии.
 */
export async function collectLastUsed(client: OpenCodeClient): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const bump = (key: string, time: number) => {
    if (!Number.isFinite(time) || time <= 0) return
    const current = result.get(key) ?? 0
    if (time > current) result.set(key, time)
  }

  // Сессии всех проектов — так же, как считает stats без параметра project
  const sessions = await listAllSessions(client)

  await Promise.all(
    sessions.map(async (session) => {
      // Модель, на которой сессия остановилась, использовалась до её обновления
      if (session.model) bump(modelLabel(session.model), session.time.updated)

      try {
        const response = await client.message.list({
          sessionID: session.id,
          limit: 200,
          order: "asc",
          type: "model-switched",
        })
        for (const message of response.data ?? []) {
          if (message.type !== "model-switched") continue
          const at = message.time?.created ?? 0
          // Модель, которую заменили, использовалась последний раз в момент замены
          if (message.previous) bump(modelLabel(message.previous), at)
          // Новая модель начала использоваться с этого момента
          if (message.model) bump(modelLabel(message.model), at)
        }
      } catch {
        // сессия могла быть удалена или недоступна — пропускаем
      }
    }),
  )

  return result
}

/** Собирает полный снимок статистики за указанный диапазон. */
export async function fetchUsage(
  client: OpenCodeClient,
  range: RangeSelection = { preset: "24h" },
): Promise<UsageSnapshot> {
  const { from, to } = resolveRange(range)
  // Клиент разворачивает ответ: возвращается сам SessionStatsInfo, без обёртки data
  const stats = await client.experimental.session.stats({ from, to, tools: "none" })

  const lastUsed = await collectLastUsed(client)

  const models: StatsModel[] = (stats.models ?? []).map((entry) => {
    const label = modelLabel(entry.model)
    return {
      label,
      providerID: entry.model.providerID,
      steps: entry.steps ?? 0,
      tokens: tokensTotal(entry.tokens),
      input: entry.tokens?.input ?? 0,
      output: entry.tokens?.output ?? 0,
      cached: (entry.tokens?.cache?.read ?? 0) + (entry.tokens?.cache?.write ?? 0),
      cost: entry.cost ?? 0,
      lastUsed: lastUsed.get(label) ?? 0,
    }
  })

  // Сортировка по последнему использованию; при равенстве — по количеству запросов
  models.sort((a, b) => (b.lastUsed - a.lastUsed) || (b.steps - a.steps))

  return {
    range: { from: stats.range?.from ?? from, to: stats.range?.to ?? to },
    sessions: stats.sessions ?? 0,
    steps: stats.steps ?? 0,
    tokens: tokensTotal(stats.tokens),
    input: stats.tokens?.input ?? 0,
    output: stats.tokens?.output ?? 0,
    cached: (stats.tokens?.cache?.read ?? 0) + (stats.tokens?.cache?.write ?? 0),
    cost: stats.cost ?? 0,
    models,
    fetchedAt: Date.now(),
  }
}

/**
 * Разбивка по сессиям и по дням.
 *
 * В stats API нет ни сессий, ни разбивки по дням — только агрегаты. Поэтому
 * суммы собираются из assistant-сообщений: у каждого есть свои tokens, cost
 * и время. Сумма совпадает с агрегатами stats API (проверено на живых данных).
 */
export async function fetchBreakdown(
  client: OpenCodeClient,
  range: RangeSelection = { preset: "24h" },
): Promise<Breakdown> {
  const { from, to } = resolveRange(range)

  const sessions = await listAllSessions(client)
  const sessionResults: SessionUsage[] = []
  const dayMap = new Map<string, DayUsage>()

  await Promise.all(
    sessions.map(async (session) => {
      const usage = await sumSession(client, session, from, to)
      if (!usage || usage.steps === 0) return
      sessionResults.push(usage)

      // Разбивка по дням собирается из тех же данных
      for (const day of usage.days) {
        const current = dayMap.get(day.date)
        if (!current) {
          dayMap.set(day.date, day)
          continue
        }
        dayMap.set(day.date, {
          date: current.date,
          steps: current.steps + day.steps,
          tokens: current.tokens + day.tokens,
          input: current.input + day.input,
          output: current.output + day.output,
          cached: current.cached + day.cached,
          cost: current.cost + day.cost,
          lastUsed: Math.max(current.lastUsed, day.lastUsed),
        })
      }
    }),
  )

  // Сортировка по последней активности; при равенстве — по токенам
  sessionResults.sort((a, b) => (b.lastUsed - a.lastUsed) || (b.tokens - a.tokens))
  const days = [...dayMap.values()].sort((a, b) => b.lastUsed - a.lastUsed)

  return { sessions: sessionResults, days }
}

interface SessionRef {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly model?: { id: string; providerID: string }
  readonly time: { created: number; updated: number }
}

/**
 * Все сессии всех проектов.
 *
 * session.list без параметров отдаёт только сессии текущего каталога,
 * поэтому проекты перебираются явно, а курсор прокручивается до конца.
 */
async function listAllSessions(client: OpenCodeClient): Promise<SessionRef[]> {
  let projects: { id: string; canonical: string }[] = []
  try {
    projects = (await client.project.list()) ?? []
  } catch {
    projects = []
  }

  const result: SessionRef[] = []
  const seen = new Set<string>()

  for (const project of projects) {
    let cursor: string | undefined
    let pages = 0
    do {
      let response
      try {
        // cursor нельзя сочетать с order — курсор уже несёт направление
        response = await client.session.list({
          project: project.id,
          limit: 100,
          ...(cursor ? { cursor } : { order: "desc" }),
        })
      } catch {
        break
      }
      for (const session of response.data ?? []) {
        if (seen.has(session.id)) continue
        seen.add(session.id)
        result.push({
          id: session.id,
          title: session.title ?? session.id,
          project: project.canonical,
          model: session.model,
          time: {
            created: session.time?.created ?? 0,
            updated: session.time?.updated ?? 0,
          },
        })
      }
      cursor = response.cursor?.next ?? undefined
      pages++
    } while (cursor && pages < 20)
  }

  return result
}

/**
 * Суммирует токены и стоимость assistant-сообщений сессии внутри диапазона.
 *
 * Сообщения читаются от новых к старым (order=desc) и страницами по курсору:
 * так до диапазона доходится за минимальное число запросов.
 */
async function sumSession(
  client: OpenCodeClient,
  session: SessionRef,
  from: number,
  to: number,
): Promise<(SessionUsage & { readonly days: DayUsage[] }) | undefined> {
  // Сессия не пересекается с диапазоном — сообщения смотреть незачем
  if (session.time.updated < from) return undefined
  if (session.time.created > to) return undefined

  let steps = 0
  let input = 0
  let output = 0
  let reasoning = 0
  let cacheRead = 0
  let cacheWrite = 0
  let cost = 0
  let lastUsed = 0
  const models = new Set<string>()
  const dayMap = new Map<string, DayUsage>()

  let cursor: string | undefined
  let pages = 0
  let finished = false

  while (!finished && pages < 100) {
    let response
    try {
      response = await client.message.list({
        sessionID: session.id,
        type: "assistant",
        limit: 200,
        ...(cursor ? { cursor } : { order: "desc" }),
      })
    } catch {
      break
    }

    const messages = response.data ?? []
    for (const message of messages) {
      if (message.type !== "assistant") continue
      const at = message.time?.created ?? 0
      if (at < from) {
        // Сообщения идут от новых к старым: дальше диапазона уже не будет
        finished = true
        break
      }
      if (at > to) continue

      const tokens = message.tokens
      const messageInput = tokens?.input ?? 0
      const messageOutput = tokens?.output ?? 0
      const messageReasoning = tokens?.reasoning ?? 0
      const messageCacheRead = tokens?.cache?.read ?? 0
      const messageCacheWrite = tokens?.cache?.write ?? 0
      const messageCost = message.cost ?? 0

      steps++
      input += messageInput
      output += messageOutput
      reasoning += messageReasoning
      cacheRead += messageCacheRead
      cacheWrite += messageCacheWrite
      cost += messageCost
      if (at > lastUsed) lastUsed = at
      if (message.model) models.add(modelLabel(message.model))

      const date = formatDayKey(at)
      const day = dayMap.get(date)
      if (!day) {
        dayMap.set(date, {
          date,
          steps: 1,
          tokens:
            messageInput + messageOutput + messageReasoning + messageCacheRead + messageCacheWrite,
          input: messageInput,
          output: messageOutput,
          cached: messageCacheRead + messageCacheWrite,
          cost: messageCost,
          lastUsed: at,
        })
      } else {
        dayMap.set(date, {
          date,
          steps: day.steps + 1,
          tokens:
            day.tokens +
            messageInput +
            messageOutput +
            messageReasoning +
            messageCacheRead +
            messageCacheWrite,
          input: day.input + messageInput,
          output: day.output + messageOutput,
          cached: day.cached + messageCacheRead + messageCacheWrite,
          cost: day.cost + messageCost,
          lastUsed: Math.max(day.lastUsed, at),
        })
      }
    }

    cursor = response.cursor?.next ?? undefined
    pages++
    if (!cursor) break
  }

  if (steps === 0) return undefined

  return {
    id: session.id,
    title: session.title,
    project: session.project,
    steps,
    tokens: input + output + reasoning + cacheRead + cacheWrite,
    input,
    output,
    cached: cacheRead + cacheWrite,
    cost,
    models: [...models],
    lastUsed,
    days: [...dayMap.values()],
  }
}

/** Ключ дня в локальном времени: ДД.ММ.ГГГГ. */
function formatDayKey(ts: number): string {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}.${mm}.${d.getFullYear()}`
}
