// Форматтеры и расчёт раскладки колонок — общие с standalone-виджетом.

export function formatNumber(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}
export function formatCompact(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  // По возрастанию разряда: K -> M -> B
  const units = [[1_000, "K"], [1_000_000, "M"], [1_000_000_000, "B"]];
  let idx = -1;
  for (let i = units.length - 1; i >= 0; i--) {
    if (abs >= units[i][0]) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return `${Math.round(n)}`;
  const [size, suffix] = units[idx];
  const scaled = n / size;
  // 999999 -> "1000.0K" (7 симв.) — поднимаем разряд, чтобы ширина не росла
  if (Math.abs(scaled) >= 999.95 && idx + 1 < units.length) {
    const [bigSize, bigSuffix] = units[idx + 1];
    return `${(n / bigSize).toFixed(1)}${bigSuffix}`;
  }
  return `${scaled.toFixed(1)}${suffix}`;
}
export function formatCount(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  // До 10 000 показываем точно ("9,999"), дальше — компактно ("12.3K", "1.2M")
  if (abs >= 10_000) return formatCompact(n);
  return formatNumber(n);
}
export function formatCost(n) {
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
export function formatAgo(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} сек назад`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m} мин ${rem} сек назад` : `${m} мин назад`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h} ч ${remM} мин назад` : `${h} ч назад`;
}
export function formatClock(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Дата в формате ДД.ММ.ГГГГ. */
export function formatDate(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Короткая дата в формате ДД.ММ. */
export function formatDateShort(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

/**
 * Разбирает пользовательский ввод даты.
 * Поддерживаются ДД.ММ.ГГГГ, ДД.ММ, ГГГГ-ММ-ДД и ДД.ММ.ГГГГ ЧЧ:ММ.
 * Возвращает начало суток в локальной таймзоне или undefined.
 */
export function parseDate(input) {
  const text = input.trim();
  if (!text) return undefined;
  let day;
  let month;
  let year;
  let hour = 0;
  let minute = 0;
  const dmy = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text);
  const dm = /^(\d{1,2})[.\/-](\d{1,2})$/.exec(text);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    hour = Number(dmy[4] ?? 0);
    minute = Number(dmy[5] ?? 0);
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
    hour = Number(ymd[4] ?? 0);
    minute = Number(ymd[5] ?? 0);
  } else if (dm) {
    day = Number(dm[1]);
    month = Number(dm[2]);
    year = new Date().getFullYear();
  } else {
    return undefined;
  }
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  if (hour > 23 || minute > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Проверка: 31.02 превращается в 03.03 — это невалидная дата
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date.getTime();
}
export function truncate(str, width) {
  if (width <= 0) return "";
  const s = String(str ?? "");
  if (s.length <= width) return s;
  if (width === 1) return "…";
  return `${s.slice(0, width - 1)}…`;
}
export function padEnd(str, width) {
  const s = String(str ?? "");
  if (s.length >= width) return truncate(s, width);
  return s.padEnd(width);
}
export function padStart(str, width) {
  const s = String(str ?? "");
  if (s.length >= width) return truncate(s, width);
  return s.padStart(width);
}
export function tokensTotal(tokens) {
  return (tokens?.input ?? 0) + (tokens?.output ?? 0) + (tokens?.reasoning ?? 0) + (tokens?.cache?.read ?? 0) + (tokens?.cache?.write ?? 0);
}
export function modelLabel(model) {
  const provider = model?.providerID ?? "?";
  const id = model?.id ?? "?";
  return `${provider}/${id}`;
}
export function stripProvider(label, provider) {
  if (!provider) return label;
  const prefix = `${provider}/`;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

// Ширины числовых колонок подобраны под максимальные значения форматов:
//   REQ     formatCount   -> "99,999"   (5)
//   TOKENS  formatCompact -> "218.6K"   (6)
//   INPUT   formatCompact -> "218.6K"   (6)
//   OUTPUT  formatCompact -> "218.6K"   (6)
//   CACHED  formatCompact -> "218.6K"   (6)
//   COST    formatCost    -> "$999.99"  (7)
export const COL = {
  req: 5,
  tokens: 6,
  input: 6,
  output: 6,
  cached: 6,
  cost: 7
};
export const NUMERIC_SUM = COL.req + COL.tokens + COL.input + COL.output + COL.cached + COL.cost;
export const GAP_COUNT = 6; // промежутков между MODEL и шестью числовыми колонками
export const MIN_GAP = 2;
export const MAX_GAP = 8;

/**
 * Раскладывает таблицу по ширине терминала.
 *
 * Ширина колонки названий задаётся longest — самым длинным названием среди
 * всех таблиц страницы. Благодаря этому числовые колонки стоят на одних и
 * тех же местах во всех режимах: моделях, сессиях и днях.
 *
 * Приоритет: числовые колонки (фиксированы) -> название -> расстояние между колонками.
 */
export function layoutColumns(longest, width) {
  const available = width - 6;
  const fit = (m, g) => m + NUMERIC_SUM + GAP_COUNT * g;
  let modelWidth = Math.min(60, longest);
  let gapWidth = MIN_GAP;
  if (fit(modelWidth, MIN_GAP) <= available) {
    const free = available - modelWidth - NUMERIC_SUM;
    gapWidth = Math.max(MIN_GAP, Math.min(MAX_GAP, Math.floor(free / GAP_COUNT)));
  }
  while (gapWidth > 0 && fit(modelWidth, gapWidth) > available) gapWidth--;
  const overflow = fit(modelWidth, gapWidth) - available;
  if (overflow > 0) modelWidth = Math.max(6, modelWidth - overflow);
  return {
    modelWidth,
    gapWidth,
    gap: " ".repeat(gapWidth)
  };
}