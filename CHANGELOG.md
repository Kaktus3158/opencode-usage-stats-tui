# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-11

### Added

- Statistics page for the OpenCode terminal UI, opened with `/tokens`.
- Three views: by model, by session and by day, switched with `v`.
- Period selection with `d`: the last 24 hours, 7 days, 30 days, or an
  arbitrary date range entered as `ДД.ММ.ГГГГ`.
- Full per-row breakdown: requests, tokens, input, output, cached and cost.
- Models ordered by when they were last used, derived from the
  `model-switched` messages in the session history.
- Automatic refresh every 60 seconds, plus a manual refresh with `r`.
- `esc` returns to the session the page was opened from.
- Published as an npm package with a server part and a TUI part, installed
  with `opencode plugin add opencode-usage-stats-tui`.

[0.1.0]: https://github.com/Kaktus3158/opencode-usage-stats-tui/releases/tag/v0.1.0
