// Lucide icons (ISC; LICENSES/ISC-lucide.txt), inlined as SVG strings with no runtime library.
// Each import pulls one icon's string from lucide-static, so only the icons listed here ship.
// Add an icon by importing it below and adding it to ICONS. UI marks are always these SVGs next
// to a text label, never text glyphs (docs/PLAN.md 7, 12.6).
//
// Compiled lesson HTML carries placeholders, `<span class="gf-icon" data-icon="book-open"
// aria-hidden="true"></span>`, which `hydrateIcons` fills after a page renders.
import ArrowLeft from "lucide-static/dist/esm/icons/arrow-left.mjs";
import ArrowRight from "lucide-static/dist/esm/icons/arrow-right.mjs";
import ArrowUpRight from "lucide-static/dist/esm/icons/arrow-up-right.mjs";
import Award from "lucide-static/dist/esm/icons/award.mjs";
import BadgeCheck from "lucide-static/dist/esm/icons/badge-check.mjs";
import BookOpen from "lucide-static/dist/esm/icons/book-open.mjs";
import Check from "lucide-static/dist/esm/icons/check.mjs";
import ChevronDown from "lucide-static/dist/esm/icons/chevron-down.mjs";
import ChevronRight from "lucide-static/dist/esm/icons/chevron-right.mjs";
import Circle from "lucide-static/dist/esm/icons/circle.mjs";
import CircleCheck from "lucide-static/dist/esm/icons/circle-check.mjs";
import CircleDashed from "lucide-static/dist/esm/icons/circle-dashed.mjs";
import CircleDotDashed from "lucide-static/dist/esm/icons/circle-dot-dashed.mjs";
import CircleQuestionMark from "lucide-static/dist/esm/icons/circle-question-mark.mjs";
import CircleX from "lucide-static/dist/esm/icons/circle-x.mjs";
import ClipboardPaste from "lucide-static/dist/esm/icons/clipboard-paste.mjs";
import Clock from "lucide-static/dist/esm/icons/clock.mjs";
import Copy from "lucide-static/dist/esm/icons/copy.mjs";
import Download from "lucide-static/dist/esm/icons/download.mjs";
import Eye from "lucide-static/dist/esm/icons/eye.mjs";
import FileText from "lucide-static/dist/esm/icons/file-text.mjs";
import FolderOpen from "lucide-static/dist/esm/icons/folder-open.mjs";
import GripVertical from "lucide-static/dist/esm/icons/grip-vertical.mjs";
import Info from "lucide-static/dist/esm/icons/info.mjs";
import Lightbulb from "lucide-static/dist/esm/icons/lightbulb.mjs";
import List from "lucide-static/dist/esm/icons/list.mjs";
import ListChecks from "lucide-static/dist/esm/icons/list-checks.mjs";
import Lock from "lucide-static/dist/esm/icons/lock.mjs";
import Maximize2 from "lucide-static/dist/esm/icons/maximize-2.mjs";
import Monitor from "lucide-static/dist/esm/icons/monitor.mjs";
import Moon from "lucide-static/dist/esm/icons/moon.mjs";
import RotateCcw from "lucide-static/dist/esm/icons/rotate-ccw.mjs";
import ScrollText from "lucide-static/dist/esm/icons/scroll-text.mjs";
import Sun from "lucide-static/dist/esm/icons/sun.mjs";
import Target from "lucide-static/dist/esm/icons/target.mjs";
import TriangleAlert from "lucide-static/dist/esm/icons/triangle-alert.mjs";
import X from "lucide-static/dist/esm/icons/x.mjs";

const ICONS = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  award: Award,
  "badge-check": BadgeCheck,
  "book-open": BookOpen,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  circle: Circle,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "circle-dot-dashed": CircleDotDashed,
  "circle-question-mark": CircleQuestionMark,
  "circle-x": CircleX,
  "clipboard-paste": ClipboardPaste,
  clock: Clock,
  copy: Copy,
  download: Download,
  eye: Eye,
  "file-text": FileText,
  "folder-open": FolderOpen,
  "grip-vertical": GripVertical,
  info: Info,
  lightbulb: Lightbulb,
  list: List,
  "list-checks": ListChecks,
  lock: Lock,
  "maximize-2": Maximize2,
  monitor: Monitor,
  moon: Moon,
  "rotate-ccw": RotateCcw,
  "scroll-text": ScrollText,
  sun: Sun,
  target: Target,
  "triangle-alert": TriangleAlert,
  x: X,
} satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES: readonly IconName[] = Object.keys(ICONS) as IconName[];

export const isIconName = (name: string): name is IconName => Object.hasOwn(ICONS, name);

/**
 * An icon as SVG markup: 1em square, `currentColor`, stroke width 1.75 (ux 6.1). Decorative by
 * default (`aria-hidden`); pass a label only when the icon is the sole content of its control.
 */
export function icon(name: IconName, options: { label?: string; className?: string } = {}): string {
  const a11y = options.label ? `role="img" aria-label="${escapeAttr(options.label)}"` : `aria-hidden="true"`;
  const cls = ["gf-svg", `gf-svg-${name}`, options.className].filter(Boolean).join(" ");
  return ICONS[name]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/class="[^"]*"/, `class="${cls}" focusable="false" ${a11y}`)
    .replace(/ width="24" height="24"/, ' width="1em" height="1em"')
    .replace(/stroke-width="2"/, 'stroke-width="1.75"')
    .replace(/> </g, "><");
}

/** Fill every empty `[data-icon]` placeholder under `root` with its SVG. */
export function hydrateIcons(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    if (el.firstElementChild) continue;
    const name = el.dataset.icon ?? "";
    if (isIconName(name)) el.innerHTML = icon(name);
  }
}

const escapeAttr = (text: string) => text.replace(/[&"<]/g, (c) => `&#${c.charCodeAt(0)};`);
