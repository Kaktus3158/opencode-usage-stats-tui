# opencode-usage-stats-tui

Token usage statistics for the [OpenCode](https://opencode.ai) terminal UI: requests, tokens and cost broken down by **model**, **session** and **day**.

OpenCode ships a `/stats` poster with an activity calendar, but it does not tell you *which* models and sessions consumed your tokens. This plugin adds the missing detail вЂ” and it reads the same data the OpenCode server already has, with no account, no password and no extra service.

```
 OpenCode Usage                                        10.11.2026 В· 15:46вЂ“15:46

 в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•® в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•® в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•® в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•® в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•® в•­в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•®
 в”‚ REQUESTS  в”‚ в”‚ TOKENS  в”‚ в”‚ INPUT     в”‚ в”‚ OUTPUT    в”‚ в”‚ CACHED   в”‚ в”‚ COST    в”‚
 в”‚ 1,218     в”‚ в”‚ 379.6M  в”‚ в”‚ 5.1M      в”‚ в”‚ 270.7K    в”‚ в”‚ 373.7M   в”‚ в”‚ $0.00   в”‚
 в”‚ Р·Р°РїСЂРѕСЃРѕРІ  в”‚ в”‚ РІСЃРµРіРѕ   в”‚ в”‚ РІС…РѕРґСЏС‰РёС…  в”‚ в”‚ РёСЃС…РѕРґСЏС‰РёС… в”‚ в”‚ РёР· РєРµС€Р°  в”‚ в”‚ РѕС†РµРЅРєР°  в”‚
 в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї в•°в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв•Ї

 MODEL                        REQ TOKENS  INPUT OUTPUT CACHED    COST
 в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
 minimax-m3.1-flash-free      834 322.5M   2.5M 204.9K 319.2M   $0.00
 nemotron-3.5-super-vl-free   257  50.3M   2.2M  47.1K  48.0M   $0.00
 deepseek-v4.1-flash-free      54   3.0M  83.5K   7.4K   2.9M   $0.00
 longcat-2.5-free              56   3.7M  95.3K   9.7K   3.5M   $0.00
 iceman-free                   17 218.6K 134.9K   1.6K  81.0K   $0.00
 в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
 TOTAL                      1,218 379.6M   5.1M 270.7K 373.7M   $0.00

 РѕР±РЅРѕРІР»РµРЅРѕ 9 СЃРµРє   РјРѕРґРµР»Рё В· 24 С‡Р°СЃР° В· r вЂ” РѕР±РЅРѕРІРёС‚СЊ В· v вЂ” РІРёРґ В· d вЂ” РїРµСЂРёРѕРґ В· esc
```

## Features

| | |
|---|---|
| **Three views** | by model, by session, by day вЂ” one keypress apart |
| **Any period** | last 24 hours, 7 days, 30 days, or an arbitrary date range |
| **Full breakdown** | requests, tokens, input, output, cached and cost per row |
| **Sorted by relevance** | models are ordered by when they were last used |
| **Local only** | reads the OpenCode API of your own instance, nothing leaves the machine |
| **No dependencies** | the plugin is bundled by OpenCode itself at runtime |

## Install

The plugin has both a server part and a TUI part, so a single command sets everything up:

```sh
opencode plugin add opencode-usage-stats-tui
```

The command installs the package and adds it to your global `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-usage-stats-tui"]
}
```

Prefer to configure it by hand? Add the same entry to `~/.config/opencode/opencode.json` вЂ” the TUI loads the plugin's TUI part from the list the server keeps.

Restart OpenCode afterwards, then open the page:

```
/tokens
```

> The plugin UI is written in Russian, because that is the language of the
> author. Say the word and an English UI is a small change.

## Usage

Run `/tokens` in the prompt, or pick **Token usage (24h)** in the command palette (`ctrl+p`).

| Key | Action |
|---|---|
| `r` | refresh the numbers |
| `v` | switch the view: models в†’ sessions в†’ days |
| `d` | pick the period: 24 hours / 7 days / 30 days / your own dates |
| `esc` | back to the session you came from |

Choosing **your own dates** asks for a start and an end date. Both accept `Р”Р”.РњРњ.Р“Р“Р“Р“`, `Р”Р”.РњРњ`, `Р“Р“Р“Р“-РњРњ-Р”Р”` and `Р”Р”.РњРњ.Р“Р“Р“Р“ Р§Р§:РњРњ`; the end day is included in full.

## How the numbers are obtained

Everything comes from the OpenCode API of the instance you are running:

- **Totals and per-model usage** вЂ” `GET /api/experimental/session/stats`, the same endpoint the built-in `/stats` poster uses.
- **Per-session and per-day usage** вЂ” the stats API has no such breakdown, so it is computed from the assistant messages of every session. Their `tokens` and `cost` sum up exactly to the stats API totals (verified against live data).
- **When a model was last used** вЂ” the stats API does not report it. It is derived from the `model-switched` messages in the session history: a switch at time *t* means the previous model was used until *t*, and the new one from *t* onwards.

No credentials are read, no URL is guessed and no database is opened: the plugin talks to the server through the client OpenCode hands it.

## Requirements

- OpenCode **2.2.0** or newer
- A terminal at least 60 columns wide

## Development

```sh
git clone https://github.com/Kaktus3158/opencode-usage-stats-tui
cd opencode-usage-stats-tui
npm install
npm run check          # typecheck + build
npm run install:local  # copy the sources into ~/.config/opencode/plugins/usage
```

`npm run build` compiles `src/` into `dist/` with the very same Solid transform OpenCode applies to local plugins. That step is required: OpenCode does not run the Solid transform on files inside `node_modules`, so a published `.tsx` would lose its reactivity.

`standalone/` holds a small separate program that renders the same table in its own window. It is not part of the published package.

## License

MIT
