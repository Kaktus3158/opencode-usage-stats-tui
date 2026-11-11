import { effect as _$effect } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { COL, formatAgo, formatClock, formatCompact, formatCost, formatDate, formatNumber, layoutColumns, padEnd, padStart, parseDate, stripProvider, truncate } from "./format.js";
import { fetchBreakdown, fetchUsage, rangeLabel, resolveRange, RANGE_PRESETS } from "./data.js";
const REFRESH_MS = 60_000;
const VIEW_LABEL = {
  models: "модели",
  sessions: "сессии",
  days: "дни"
};

/** Заголовок колонки названий в каждом виде. */
const VIEW_TITLE = {
  models: "MODEL",
  sessions: "SESSION",
  days: "DATE"
};
export default Plugin.define({
  id: "usage.stats",
  setup(context) {
    const [snapshot, setSnapshot] = createSignal();
    const [breakdown, setBreakdown] = createSignal();
    const [error, setError] = createSignal();
    const [now, setNow] = createSignal(Date.now());
    // Маршрут, с которого открыли страницу — на него возвращает escape
    const [previous, setPrevious] = createSignal({
      type: "home"
    });
    // Выбранный диапазон и режим отображения
    const [range, setRange] = createSignal({
      preset: "24h"
    });
    const [view, setView] = createSignal("models");
    const load = async () => {
      const current = range();
      // Оба набора запрашиваются вместе и применяются разом: иначе ширина
      // колонок менялась бы после загрузки, и таблица «прыгала» бы на экране
      const [stats, breakdown] = await Promise.allSettled([fetchUsage(context.client, current), fetchBreakdown(context.client, current)]);
      if (stats.status === "rejected") {
        setError(stats.reason instanceof Error ? stats.reason.message : String(stats.reason));
        return;
      }
      setSnapshot(stats.value);
      setError(undefined);
      if (breakdown.status === "fulfilled") setBreakdown(breakdown.value);
    };
    void load();
    const refreshTimer = setInterval(() => void load(), REFRESH_MS);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => {
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
    });

    // Полноэкранная страница со статистикой.
    // Имя "usage" занято встроенным маршрутом /usage, поэтому используем "usage-tokens".
    context.ui.router.register({
      name: "usage-tokens",
      render: () => _$createComponent(UsagePage, {
        context: context,
        snapshot: snapshot,
        breakdown: breakdown,
        error: error,
        now: now,
        reload: load,
        range: range,
        setRange: setRange,
        view: view,
        setView: setView,
        onClose: () => context.ui.router.navigate(previous())
      })
    });

    // Команда открытия страницы.
    // Встроенные /usage (модели и лимиты) и /stats (постер OpenCode) уже заняты,
    // поэтому наша команда называется /tokens.
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "usage.tokens.open",
        title: "Token usage (24h)",
        description: "Запросы и токены за последние 24 часа",
        group: "System",
        palette: true,
        slash: {
          name: "tokens"
        },
        run() {
          const current = context.ui.router.current();
          if (current.type === "plugin" && current.name === "usage-tokens") return;
          // Запоминаем маршрут, с которого открываем страницу, чтобы вернуться по escape.
          // Копия нужна, потому что роутер отдаёт мутируемый объект текущего маршрута.
          setPrevious({
            ...current
          });
          context.ui.dialog.clear();
          context.ui.router.navigate({
            type: "plugin",
            name: "usage-tokens"
          });
        }
      }]
    }));
  }
});
function UsagePage(props) {
  const theme = props.context.theme;
  const dimensions = useTerminalDimensions();
  const width = () => Math.max(40, dimensions().width - 6);
  props.context.keymap.layer(() => ({
    commands: [{
      id: "usage.reload",
      bind: "r",
      title: "Обновить",
      run: () => void props.reload()
    }, {
      id: "usage.view",
      bind: "v",
      title: "Вид: модели / сессии / дни",
      run() {
        const order = ["models", "sessions", "days"];
        props.setView(order[(order.indexOf(props.view()) + 1) % order.length]);
      }
    }, {
      id: "usage.range",
      bind: "d",
      title: "Выбрать период",
      run() {
        void pickRange(props.context, props.range(), props.setRange).then(changed => {
          if (changed) void props.reload();
        });
      }
    }, {
      id: "usage.back",
      bind: "escape",
      title: "Назад",
      run: props.onClose
    }]
  }));
  const stats = createMemo(() => props.snapshot());
  const sessions = createMemo(() => props.breakdown()?.sessions ?? []);
  const days = createMemo(() => props.breakdown()?.days ?? []);

  // Общий провайдер убирается из имён моделей — он у всех одинаковый
  const modelLabels = createMemo(() => {
    const snapshot = stats();
    if (!snapshot) return [];
    const providers = new Set(snapshot.models.map(m => m.providerID));
    const common = providers.size === 1 ? [...providers][0] : null;
    return snapshot.models.map(m => stripProvider(m.label, common));
  });

  /**
   * Общая раскладка для всех видов.
   *
   * Ширина колонки названий считается по самым длинным названиям среди всех
   * таблиц страницы, поэтому числовые колонки стоят на одних и тех же местах
   * в каждом виде: и ширина колонки, и расстояние между колонками совпадают.
   */
  const layout = createMemo(() => {
    const longest = [...modelLabels(), ...sessions().map(s => s.title), ...days().map(d => d.date)].reduce((max, label) => Math.max(max, label.length), 5);
    const {
      modelWidth,
      gap
    } = layoutColumns(longest, width());
    return {
      modelWidth,
      gap
    };
  });
  const headerRow = createMemo(() => {
    const {
      modelWidth,
      gap
    } = layout();
    return padEnd(VIEW_TITLE[props.view()], modelWidth) + gap + padStart("REQ", COL.req) + gap + padStart("TOKENS", COL.tokens) + gap + padStart("INPUT", COL.input) + gap + padStart("OUTPUT", COL.output) + gap + padStart("CACHED", COL.cached) + gap + padStart("COST", COL.cost);
  });
  const range = createMemo(() => {
    const snapshot = stats();
    if (!snapshot) return "";
    const resolved = resolveRange(props.range(), snapshot.range.to);
    const from = new Date(resolved.from);
    const date = from.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    return `${date} · ${formatClock(resolved.from)}–${formatClock(resolved.to)}`;
  });
  const cardDefs = createMemo(() => {
    const snapshot = stats();
    if (!snapshot) return [];
    return [{
      title: "REQUESTS",
      value: formatNumber(snapshot.steps),
      hint: "запросов",
      color: theme.text.action.primary.base
    }, {
      title: "TOKENS",
      value: formatCompact(snapshot.tokens),
      hint: "всего",
      color: theme.text.base
    }, {
      title: "INPUT",
      value: formatCompact(snapshot.input),
      hint: "входящих",
      color: theme.text.base
    }, {
      title: "OUTPUT",
      value: formatCompact(snapshot.output),
      hint: "исходящих",
      color: theme.text.base
    }, {
      title: "CACHED",
      value: formatCompact(snapshot.cached),
      hint: "из кеша",
      color: theme.text.muted
    }, {
      title: "COST",
      value: formatCost(snapshot.cost),
      hint: "оценка",
      color: theme.text.base
    }];
  });
  const separator = createMemo(() => "─".repeat(Math.max(10, width() - 2)));
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$5 = _$createElement("text"),
      _el$13 = _$createElement("box"),
      _el$14 = _$createElement("text"),
      _el$15 = _$createElement("text"),
      _el$16 = _$createTextNode(` · `),
      _el$17 = _$createTextNode(` · r — обновить · v — вид · d — период · esc — назад`);
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$13);
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "height", "100%");
    _$setProp(_el$, "flexDirection", "column");
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "width", "100%");
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$setProp(_el$2, "paddingLeft", 1);
    _$setProp(_el$2, "paddingRight", 1);
    _$insertNode(_el$3, _$createTextNode(`OpenCode Usage`));
    _$insert(_el$5, range);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return props.error();
      },
      children: message => (() => {
        var _el$18 = _$createElement("box"),
          _el$19 = _$createElement("text"),
          _el$20 = _$createTextNode(`Не удалось загрузить статистику: `);
        _$insertNode(_el$18, _el$19);
        _$setProp(_el$18, "paddingLeft", 1);
        _$setProp(_el$18, "paddingRight", 1);
        _$setProp(_el$18, "marginTop", 1);
        _$insertNode(_el$19, _el$20);
        _$insert(_el$19, message, null);
        _$effect(_$p => _$setProp(_el$19, "fg", theme.text.feedback.error.base, _$p));
        return _el$18;
      })()
    }), _el$13);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!!props.error())() && stats();
      },
      get children() {
        var _el$6 = _$createElement("box"),
          _el$7 = _$createElement("box"),
          _el$8 = _$createElement("box"),
          _el$9 = _$createElement("text"),
          _el$0 = _$createElement("text");
        _$insertNode(_el$6, _el$7);
        _$insertNode(_el$6, _el$8);
        _$setProp(_el$6, "width", "100%");
        _$setProp(_el$6, "flexDirection", "column");
        _$setProp(_el$6, "flexGrow", 1);
        _$setProp(_el$6, "paddingLeft", 1);
        _$setProp(_el$6, "paddingRight", 1);
        _$setProp(_el$7, "width", "100%");
        _$setProp(_el$7, "flexDirection", "row");
        _$setProp(_el$7, "gap", 1);
        _$setProp(_el$7, "marginTop", 1);
        _$insert(_el$7, _$createComponent(For, {
          get each() {
            return cardDefs();
          },
          children: card => (() => {
            var _el$21 = _$createElement("box"),
              _el$22 = _$createElement("text"),
              _el$23 = _$createElement("text"),
              _el$24 = _$createElement("text");
            _$insertNode(_el$21, _el$22);
            _$insertNode(_el$21, _el$23);
            _$insertNode(_el$21, _el$24);
            _$setProp(_el$21, "flexGrow", 1);
            _$setProp(_el$21, "flexDirection", "column");
            _$setProp(_el$21, "borderStyle", "rounded");
            _$setProp(_el$21, "paddingLeft", 1);
            _$setProp(_el$21, "paddingRight", 1);
            _$insert(_el$22, () => card.title);
            _$insert(_el$23, () => card.value);
            _$insert(_el$24, () => card.hint);
            _$effect(_p$ => {
              var _v$11 = theme.border.base,
                _v$12 = theme.background.raised.base,
                _v$13 = theme.text.muted,
                _v$14 = card.color,
                _v$15 = TextAttributes.BOLD,
                _v$16 = theme.text.faint;
              _v$11 !== _p$.e && (_p$.e = _$setProp(_el$21, "borderColor", _v$11, _p$.e));
              _v$12 !== _p$.t && (_p$.t = _$setProp(_el$21, "backgroundColor", _v$12, _p$.t));
              _v$13 !== _p$.a && (_p$.a = _$setProp(_el$22, "fg", _v$13, _p$.a));
              _v$14 !== _p$.o && (_p$.o = _$setProp(_el$23, "fg", _v$14, _p$.o));
              _v$15 !== _p$.i && (_p$.i = _$setProp(_el$23, "attributes", _v$15, _p$.i));
              _v$16 !== _p$.n && (_p$.n = _$setProp(_el$24, "fg", _v$16, _p$.n));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined,
              i: undefined,
              n: undefined
            });
            return _el$21;
          })()
        }));
        _$insertNode(_el$8, _el$9);
        _$insertNode(_el$8, _el$0);
        _$setProp(_el$8, "flexDirection", "column");
        _$setProp(_el$8, "marginTop", 1);
        _$insert(_el$9, headerRow);
        _$insert(_el$0, separator);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return props.view() === "models";
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return stats()?.models ?? [];
              },
              children: (model, index) => (() => {
                var _el$25 = _$createElement("text");
                _$insert(_el$25, () => padEnd(truncate(modelLabels()[index()] ?? "", layout().modelWidth), layout().modelWidth), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatNumber(model.steps), COL.req), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatCompact(model.tokens), COL.tokens), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatCompact(model.input), COL.input), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatCompact(model.output), COL.output), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatCompact(model.cached), COL.cached), null);
                _$insert(_el$25, () => layout().gap, null);
                _$insert(_el$25, () => padStart(formatCost(model.cost), COL.cost), null);
                _$effect(_$p => _$setProp(_el$25, "fg", theme.text.base, _$p));
                return _el$25;
              })()
            });
          }
        }), null);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return props.view() === "sessions";
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return sessions();
              },
              children: session => (() => {
                var _el$26 = _$createElement("text");
                _$insert(_el$26, () => padEnd(truncate(session.title, layout().modelWidth), layout().modelWidth), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatNumber(session.steps), COL.req), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatCompact(session.tokens), COL.tokens), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatCompact(session.input), COL.input), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatCompact(session.output), COL.output), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatCompact(session.cached), COL.cached), null);
                _$insert(_el$26, () => layout().gap, null);
                _$insert(_el$26, () => padStart(formatCost(session.cost), COL.cost), null);
                _$effect(_$p => _$setProp(_el$26, "fg", theme.text.base, _$p));
                return _el$26;
              })()
            });
          }
        }), null);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return props.view() === "days";
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return days();
              },
              children: day => (() => {
                var _el$27 = _$createElement("text");
                _$insert(_el$27, () => padEnd(truncate(day.date, layout().modelWidth), layout().modelWidth), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatNumber(day.steps), COL.req), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatCompact(day.tokens), COL.tokens), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatCompact(day.input), COL.input), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatCompact(day.output), COL.output), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatCompact(day.cached), COL.cached), null);
                _$insert(_el$27, () => layout().gap, null);
                _$insert(_el$27, () => padStart(formatCost(day.cost), COL.cost), null);
                _$effect(_$p => _$setProp(_el$27, "fg", theme.text.base, _$p));
                return _el$27;
              })()
            });
          }
        }), null);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return _$memo(() => props.view() === "models")() && stats();
          },
          children: snapshot => [(() => {
            var _el$28 = _$createElement("text");
            _$insert(_el$28, separator);
            _$effect(_$p => _$setProp(_el$28, "fg", theme.border.base, _$p));
            return _el$28;
          })(), (() => {
            var _el$29 = _$createElement("text");
            _$insert(_el$29, () => padEnd("TOTAL", layout().modelWidth), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatNumber(snapshot().steps), COL.req), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatCompact(snapshot().tokens), COL.tokens), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatCompact(snapshot().input), COL.input), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatCompact(snapshot().output), COL.output), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatCompact(snapshot().cached), COL.cached), null);
            _$insert(_el$29, () => layout().gap, null);
            _$insert(_el$29, () => padStart(formatCost(snapshot().cost), COL.cost), null);
            _$effect(_p$ => {
              var _v$17 = theme.text.base,
                _v$18 = TextAttributes.BOLD;
              _v$17 !== _p$.e && (_p$.e = _$setProp(_el$29, "fg", _v$17, _p$.e));
              _v$18 !== _p$.t && (_p$.t = _$setProp(_el$29, "attributes", _v$18, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$29;
          })()]
        }), null);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return _$memo(() => props.view() === "sessions")() && sessions().length > 0;
          },
          get children() {
            return [(() => {
              var _el$1 = _$createElement("text");
              _$insert(_el$1, separator);
              _$effect(_$p => _$setProp(_el$1, "fg", theme.border.base, _$p));
              return _el$1;
            })(), (() => {
              var _el$10 = _$createElement("text");
              _$insert(_el$10, () => padEnd("TOTAL", layout().modelWidth), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatNumber(sessions().reduce((a, s) => a + s.steps, 0)), COL.req), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatCompact(sessions().reduce((a, s) => a + s.tokens, 0)), COL.tokens), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatCompact(sessions().reduce((a, s) => a + s.input, 0)), COL.input), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatCompact(sessions().reduce((a, s) => a + s.output, 0)), COL.output), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatCompact(sessions().reduce((a, s) => a + s.cached, 0)), COL.cached), null);
              _$insert(_el$10, () => layout().gap, null);
              _$insert(_el$10, () => padStart(formatCost(sessions().reduce((a, s) => a + s.cost, 0)), COL.cost), null);
              _$effect(_p$ => {
                var _v$ = theme.text.base,
                  _v$2 = TextAttributes.BOLD;
                _v$ !== _p$.e && (_p$.e = _$setProp(_el$10, "fg", _v$, _p$.e));
                _v$2 !== _p$.t && (_p$.t = _$setProp(_el$10, "attributes", _v$2, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$10;
            })()];
          }
        }), null);
        _$insert(_el$8, _$createComponent(Show, {
          get when() {
            return _$memo(() => props.view() === "days")() && days().length > 0;
          },
          get children() {
            return [(() => {
              var _el$11 = _$createElement("text");
              _$insert(_el$11, separator);
              _$effect(_$p => _$setProp(_el$11, "fg", theme.border.base, _$p));
              return _el$11;
            })(), (() => {
              var _el$12 = _$createElement("text");
              _$insert(_el$12, () => padEnd("TOTAL", layout().modelWidth), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatNumber(days().reduce((a, d) => a + d.steps, 0)), COL.req), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatCompact(days().reduce((a, d) => a + d.tokens, 0)), COL.tokens), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatCompact(days().reduce((a, d) => a + d.input, 0)), COL.input), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatCompact(days().reduce((a, d) => a + d.output, 0)), COL.output), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatCompact(days().reduce((a, d) => a + d.cached, 0)), COL.cached), null);
              _$insert(_el$12, () => layout().gap, null);
              _$insert(_el$12, () => padStart(formatCost(days().reduce((a, d) => a + d.cost, 0)), COL.cost), null);
              _$effect(_p$ => {
                var _v$3 = theme.text.base,
                  _v$4 = TextAttributes.BOLD;
                _v$3 !== _p$.e && (_p$.e = _$setProp(_el$12, "fg", _v$3, _p$.e));
                _v$4 !== _p$.t && (_p$.t = _$setProp(_el$12, "attributes", _v$4, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$12;
            })()];
          }
        }), null);
        _$effect(_p$ => {
          var _v$5 = theme.text.muted,
            _v$6 = theme.border.base;
          _v$5 !== _p$.e && (_p$.e = _$setProp(_el$9, "fg", _v$5, _p$.e));
          _v$6 !== _p$.t && (_p$.t = _$setProp(_el$0, "fg", _v$6, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$6;
      }
    }), _el$13);
    _$insertNode(_el$13, _el$14);
    _$insertNode(_el$13, _el$15);
    _$setProp(_el$13, "width", "100%");
    _$setProp(_el$13, "flexDirection", "row");
    _$setProp(_el$13, "justifyContent", "space-between");
    _$setProp(_el$13, "paddingLeft", 1);
    _$setProp(_el$13, "paddingRight", 1);
    _$insert(_el$14, (() => {
      var _c$ = _$memo(() => !!stats());
      return () => _c$() ? `обновлено ${formatAgo(props.now() - stats().fetchedAt)}` : "загрузка…";
    })());
    _$insertNode(_el$15, _el$16);
    _$insertNode(_el$15, _el$17);
    _$insert(_el$15, () => VIEW_LABEL[props.view()], _el$16);
    _$insert(_el$15, () => rangeLabel(props.range()), _el$17);
    _$effect(_p$ => {
      var _v$7 = theme.background.base,
        _v$8 = theme.text.base,
        _v$9 = TextAttributes.BOLD,
        _v$0 = theme.text.muted,
        _v$1 = theme.text.muted,
        _v$10 = theme.text.faint;
      _v$7 !== _p$.e && (_p$.e = _$setProp(_el$, "backgroundColor", _v$7, _p$.e));
      _v$8 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$8, _p$.t));
      _v$9 !== _p$.a && (_p$.a = _$setProp(_el$3, "attributes", _v$9, _p$.a));
      _v$0 !== _p$.o && (_p$.o = _$setProp(_el$5, "fg", _v$0, _p$.o));
      _v$1 !== _p$.i && (_p$.i = _$setProp(_el$14, "fg", _v$1, _p$.i));
      _v$10 !== _p$.n && (_p$.n = _$setProp(_el$15, "fg", _v$10, _p$.n));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$;
  })();
}

/**
 * Диалог выбора периода.
 *
 * Сначала предлагаются готовые диапазоны, затем — произвольные даты.
 * Возвращает true, если период изменился.
 */
async function pickRange(context, current, apply) {
  const preset = await context.ui.dialog.select({
    title: "Период статистики",
    options: [...RANGE_PRESETS.map(p => ({
      title: p.label,
      value: p.id
    })), {
      title: "Свои даты…",
      value: "custom"
    }]
  });
  if (preset === undefined) return false;
  if (preset !== "custom") {
    if (current.preset === preset) return false;
    apply({
      preset
    });
    return true;
  }

  // Произвольный диапазон: спрашиваем даты по очереди
  const fromInput = await context.ui.dialog.prompt({
    title: "Начало периода",
    description: "Формат: ДД.ММ.ГГГГ (например, 01.11.2026)",
    placeholder: "01.11.2026"
  });
  if (fromInput === undefined) return false;
  const from = parseDate(fromInput);
  if (from === undefined) {
    await context.ui.dialog.alert({
      title: "Некорректная дата",
      message: `Не удалось разобрать «${fromInput}». Ожидается формат ДД.ММ.ГГГГ.`
    });
    return false;
  }
  const toInput = await context.ui.dialog.prompt({
    title: "Конец периода",
    description: "Формат: ДД.ММ.ГГГГ (например, 11.11.2026). День включается целиком.",
    placeholder: formatDate(Date.now())
  });
  if (toInput === undefined) return false;
  const toStart = parseDate(toInput);
  if (toStart === undefined) {
    await context.ui.dialog.alert({
      title: "Некорректная дата",
      message: `Не удалось разобрать «${toInput}». Ожидается формат ДД.ММ.ГГГГ.`
    });
    return false;
  }
  // Конец периода включается целиком: сдвигаем на последнюю миллисекунду суток
  const to = toStart + 24 * 60 * 60 * 1000 - 1;
  if (to < from) {
    await context.ui.dialog.alert({
      title: "Неверный диапазон",
      message: "Конец периода раньше начала."
    });
    return false;
  }
  apply({
    custom: {
      from,
      to
    }
  });
  return true;
}