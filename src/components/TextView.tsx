import { memo } from 'react';
import { CELL } from '../model/geometry';
import type { TextBox, TextSize } from '../model/types';
import { textWidth } from '../lib/text';

export const TEXT_SIZES: Record<TextSize, { px: number; label: string }> = {
  s: { px: 14, label: 'Small' },
  m: { px: 20, label: 'Medium' },
  l: { px: 32, label: 'Large' },
};

const PAD = 8;

const fontOf = (size: TextSize) => `700 ${TEXT_SIZES[size].px}px Inter, system-ui, sans-serif`;

/** Breaks text into lines that fit `width` pixels, keeping the writer's own line breaks. */
export function wrapText(text: string, width: number, font: string): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const word of words) {
      const next = line + word;
      if (line && !/^\s+$/.test(word) && textWidth(next.trimEnd(), font) > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
        // A single word longer than the box is cut into pieces.
        while (textWidth(line, font) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && textWidth(line.slice(0, cut), font) > width) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Size of a text box in world pixels. */
export function textBoxRect(box: TextBox) {
  const font = fontOf(box.size);
  const px = TEXT_SIZES[box.size].px;
  const lines = wrapText(box.text || ' ', box.w * CELL - PAD * 2, font);
  const lineH = Math.round(px * 1.3);
  return { x: box.x * CELL, y: box.y * CELL, w: box.w * CELL, h: Math.max(CELL, lines.length * lineH + PAD * 2), lines, lineH, font, px };
}

/**
 * A free text note. The whole box takes the mouse (drag to move, right-click
 * to delete, double-click to edit); when selected, the dot on its right edge
 * changes how wide the text wraps.
 */
export const TextView = memo(function TextView({ box, selected }: { box: TextBox; selected: boolean }) {
  const r = textBoxRect(box);
  const empty = !box.text.trim();
  return (
    <g className={`text-box${selected ? ' selected' : ''}${box.card ? ' card' : ''}`} data-text-id={box.id} data-text-part="body">
      <rect className="text-hit" x={r.x} y={r.y} width={r.w} height={r.h} rx={10} />
      <text className={`text-body${empty ? ' empty' : ''}`} style={{ font: r.font, fill: box.color || undefined }}>
        {(empty ? ['Empty text'] : r.lines).map((line, i) => (
          <tspan key={i} x={r.x + PAD} y={r.y + PAD + r.lineH * i + r.px * 0.95}>
            {line || ' '}
          </tspan>
        ))}
      </text>
      {selected && (
        <g className="text-handle" data-text-id={box.id} data-text-part="handle" transform={`translate(${r.x + r.w} ${r.y + r.h / 2})`}>
          <circle r={8} />
          <path d="M -3 0 L 3 0 M -1.5 -2 L -3.5 0 L -1.5 2 M 1.5 -2 L 3.5 0 L 1.5 2" />
        </g>
      )}
    </g>
  );
});
