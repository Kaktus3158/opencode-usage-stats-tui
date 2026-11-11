// Сборка пакета: Solid-JSX -> обычный JavaScript.
//
// Тот же transform, что применяет сам OpenCode к локальным плагинам
// (babel-preset-solid с moduleName "@opentui/solid" и generate "universal").
// Он нужен потому, что Solid-трансформ хоста не трогает файлы в node_modules:
// опубликованный .tsx скомпилировался бы в рантайм-JSX без реактивности.
//
// Полученный код импортирует только "@opentui/solid", "solid-js" и
// "@opencode/plugin/tui" — их OpenCode подменяет своими копиями во время
// выполнения, поэтому у плагина нет runtime-зависимостей.
import { transformAsync } from "@babel/core"
import ts from "@babel/preset-typescript"
import solid from "babel-preset-solid"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "src")
const out = join(root, "dist")

/** Файлы, которые попадают в сборку. */
const entries = ["index.ts", "tui.tsx", "data.ts", "format.ts"]

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

for (const entry of entries) {
  const filename = join(src, entry)
  const code = await readFile(filename, "utf8")
  const result = await transformAsync(code, {
    filename,
    configFile: false,
    babelrc: false,
    presets: [
      [solid, { moduleName: "@opentui/solid", generate: "universal" }],
      [ts],
    ],
  })
  const target = join(out, entry.replace(/\.tsx?$/, ".js"))
  await writeFile(target, result?.code ?? code, "utf8")
  console.log("собрано:", relative(root, target))
}
