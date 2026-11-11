import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// node:sqlite доступен не во всех версиях Node — подключаем опционально
let DatabaseSync = null
try {
  ;({ DatabaseSync } = await import("node:sqlite"))
} catch {
  DatabaseSync = null
}

function dbPaths() {
  const home = homedir()
  const paths = []
  const xdg = process.env.XDG_DATA_HOME
  if (xdg) paths.push(join(xdg, "opencode", "opencode.db"))
  paths.push(join(home, ".local", "share", "opencode", "opencode.db"))
  if (process.env.APPDATA) {
    paths.push(join(process.env.APPDATA, "opencode", "opencode.db"))
  }
  if (process.env.LOCALAPPDATA) {
    paths.push(join(process.env.LOCALAPPDATA, "opencode", "opencode.db"))
  }
  return paths
}

function findDb() {
  for (const p of dbPaths()) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Возвращает Map<"provider/id", timestamp последнего использования модели>.
 * Читает локальную БД OpenCode (session_message -> data.model).
 * Если БД недоступна или схема изменилась — возвращает пустую Map.
 */
export function getLastUsed() {
  const result = new Map()
  const dbPath = findDb()
  if (!dbPath) return result

  let db = null
  try {
    if (!DatabaseSync) return result
    db = new DatabaseSync(dbPath, { readOnly: true })
    const rows = db
      .prepare(
        `select json_extract(data, '$.model.providerID') as provider,
                json_extract(data, '$.model.id') as model_id,
                max(time_created) as last
           from session_message
          where type = 'assistant'
            and json_extract(data, '$.model.id') is not null
          group by provider, model_id`,
      )
      .all()
    for (const row of rows) {
      const key = `${row.provider}/${row.model_id}`
      result.set(key, Number(row.last) || 0)
    }
  } catch {
    // БД заблокирована или схема другая — не критично, сортировка останется по шагам
  } finally {
    try {
      db?.close()
    } catch {
      // ignore
    }
  }
  return result
}
