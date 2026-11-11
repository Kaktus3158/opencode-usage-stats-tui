// Устанавливает плагин в локальный каталог OpenCode — для разработки.
//
// Локальный каталог плагина загружается OpenCode по именам файлов в корне
// (index.ts — server-часть, tui.tsx — TUI-часть), поэтому в установленной
// копии package.json намеренно без поля "exports": иначе загрузчик пойдёт
// через self-reference-резолв имени пакета, а не по файлам.
//
// node scripts/install-local.mjs [--target <dir>]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const targetIndex = args.indexOf("--target")
const target =
  targetIndex >= 0 && args[targetIndex + 1]
    ? resolve(args[targetIndex + 1])
    : join(homedir(), ".config", "opencode", "plugins", "usage")

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

// Исходники кладутся в корень каталога плагина: импорты между ними
// относительные и одинаковые в собранном dist.
for (const entry of ["index.ts", "tui.tsx", "data.ts", "format.ts"]) {
  cpSync(join(root, "src", entry), join(target, entry))
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
delete pkg.exports
delete pkg.scripts
delete pkg.devDependencies
writeFileSync(join(target, "package.json"), JSON.stringify(pkg, null, 2) + "\n")

console.log("Плагин установлен:", target)
console.log("Файлы:", ["index.ts", "tui.tsx", "data.ts", "format.ts", "package.json"].join(", "))
