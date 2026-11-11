import { Plugin } from "@opencode/plugin";

// Server-часть плагина. Сама статистика не нужна серверу: TUI-часть берёт
// данные напрямую через клиент OpenCode (client.experimental.session.stats).
// Часть присутствует, чтобы каталог плагина корректно обнаруживался сервером.
export default Plugin.define({
  id: "usage.stats",
  setup() {}
});