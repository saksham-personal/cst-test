import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus } from 'lucide-react';

const descriptionPreviewStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  whiteSpace: 'pre-wrap',
  lineHeight: '1.15rem',
};

const tooltipViewportPadding = 16;

function formatDescriptionTooltipHtml(value: string) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return escaped
    .split('\n')
    .map((line) => {
      const match = line.match(/^([^:]+:)(\s*)(.*)$/);
      if (!match) return line;
      const [, label, spacer, content] = match;
      return `<strong>${label}</strong>${spacer}${content}`;
    })
    .join('<br />');
}

export function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex h-full w-full items-center justify-end font-mono pr-2 text-sm text-text-primary">
      {value != null ? value.toFixed(3) : '-'}
    </div>
  );
}

export function CurrencyCell({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) {
    return <div className="flex h-full w-full items-center justify-end pr-2 text-sm text-text-tertiary">—</div>;
  }

  return (
    <div className="flex h-full w-full items-center justify-end font-mono pr-2 text-sm text-text-primary">
      {new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)}
    </div>
  );
}

export function MatchPctCell({ value }: { value: number }) {
  const pct = value != null ? value * 100 : 0;
  const text = value != null ? `${pct.toFixed(0)}%` : '-';
  const tone = getMatchPctTone(pct);
  return (
    <div className={`flex h-full w-full items-center gap-2 pr-2 text-sm ${tone.textClass}`}>
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone.barClass}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="font-mono tabular-nums w-9 text-right">{text}</span>
    </div>
  );
}

export function getMatchPctTone(pct: number) {
  if (pct >= 70) {
    return {
      textClass: 'text-emerald-600',
      barClass: 'bg-emerald-500',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (pct >= 50) {
    return {
      textClass: 'text-yellow-600',
      barClass: 'bg-yellow-500',
      badgeClass: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    };
  }
  if (pct >= 30) {
    return {
      textClass: 'text-orange-600',
      barClass: 'bg-orange-500',
      badgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
    };
  }
  return {
    textClass: 'text-rose-600',
    barClass: 'bg-rose-500',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  };
}

export function MatchPctBadge({ value }: { value: number }) {
  const pct = value != null ? value * 100 : 0;
  const tone = getMatchPctTone(pct);
  return (
    <span
      title="Match %"
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${tone.badgeClass}`}
    >
      {pct.toFixed(0)}%
    </span>
  );
}

export function LongTextCell({ value }: { value: string }) {
  return (
    <div className="w-full truncate text-sm text-text-secondary" title={value}>
      {value}
    </div>
  );
}

export function normalizeWebsiteUrl(value: string) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getWebsiteDisplayValue(value: string) {
  return (value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

export function LinkCell({ value, url }: { value: string, url?: string }) {
  const rawValue = (value || url || '').trim();
  const displayValue = getWebsiteDisplayValue(rawValue);
  const href = normalizeWebsiteUrl(url || rawValue);

  if (!displayValue || !href) {
    return <span className="text-sm text-text-tertiary">—</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block max-w-full truncate text-info hover:underline text-sm font-medium"
      title={displayValue}
      onClick={(event) => event.stopPropagation()}
    >
      {displayValue}
    </a>
  );
}

export function ConnectionQualityCell({ value }: { value: string }) {
  const normalized = (value || '').trim().toLowerCase();
  const tone = normalized === 'high'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : normalized === 'medium'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : normalized === 'low'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-600';
  const dot = normalized === 'high'
    ? 'bg-emerald-500'
    : normalized === 'medium'
      ? 'bg-amber-500'
      : normalized === 'low'
        ? 'bg-rose-500'
        : 'bg-slate-400';
  const label = value?.trim() || 'No Connection';

  return (
    <div className="flex h-full w-full items-center">
      <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
    </div>
  );
}

export function MncFlagCell({ value }: { value: string }) {
  const normalized = (value || '').trim().toLowerCase();
  const enabled = normalized === 'yes' || normalized === 'true' || normalized === 'y';

  return (
    <div className="flex h-full w-full items-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs font-semibold text-text-primary">
        <span
          className={
            'inline-flex h-4 w-4 items-center justify-center rounded-full border ' +
            (enabled
              ? 'border-text-primary bg-text-primary text-surface-0'
              : 'border-text-tertiary bg-surface-0 text-text-tertiary')
          }
        >
          {enabled ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </span>
        {enabled ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

export function DescriptionCell({ value }: { value: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  if (!value) {
    return <span className="text-sm text-text-tertiary">—</span>;
  }

  const tooltipMarkup = useMemo(() => formatDescriptionTooltipHtml(value), [value]);
  const tooltipStyle: CSSProperties = {
    left: Math.min(pointer.x + 18, Math.max(tooltipViewportPadding, window.innerWidth - 850)),
    top: Math.min(pointer.y + 18, Math.max(tooltipViewportPadding, window.innerHeight - 360)),
    maxWidth: `min(850px, calc(100vw - ${tooltipViewportPadding * 2}px))`,
    maxHeight: `calc(100vh - ${tooltipViewportPadding * 2}px)`,
  };

  const tooltip = isHovered && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="pointer-events-none fixed z-[9999] overflow-auto rounded-xl border border-border/90 bg-surface-0/98 px-4 py-3 text-[13px] leading-6 text-text-primary shadow-2xl backdrop-blur-sm"
          style={tooltipStyle}
          dangerouslySetInnerHTML={{ __html: tooltipMarkup }}
        />,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className="w-full cursor-help text-sm text-text-secondary"
        onMouseEnter={(event) => {
          setIsHovered(true);
          setPointer({ x: event.clientX, y: event.clientY });
        }}
        onMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => setIsHovered(false)}
        title=""
      >
        <div style={descriptionPreviewStyle}>{value}</div>
      </div>
      {tooltip}
    </>
  );
}

/**
 * Renders server-provided snippet text that contains <mark>...</mark> tags.
 * Tags are safe-whitelisted: only <mark> is interpreted, everything else is
 * escaped. This keeps the surface compatible with dangerouslySetInnerHTML
 * without actually forwarding arbitrary HTML from the API.
 */
export function MarkedSnippet({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeMark(html || '');
  return <span className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}

function sanitizeMark(input: string): string {
  // 1) escape every HTML-sensitive character
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // 2) un-escape only our whitelisted <mark> / </mark> pair
  return escaped
    .replace(/&lt;mark&gt;/g, '<mark class="bg-brand/20 text-brand font-semibold rounded px-0.5">')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}
