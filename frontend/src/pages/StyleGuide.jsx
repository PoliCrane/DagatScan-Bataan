import { StaticPageShell, StaticPageSection } from "../components/StaticPageShell";
import AsyncSection from "../components/AsyncSection";

const COLORS = [
  ["primary", "#0077B6"],
  ["primary-dark", "#005FA3"],
  ["secondary", "#00B894"],
  ["navy", "#060B37"],
  ["card", "#EAF4F8"],
  ["danger", "#FF6B6B"],
  ["accent", "#FFD93D"],
];
const RISK = [
  ["Very High", "#c0392b"],
  ["High", "#e67e22"],
  ["Moderate", "#f1c40f"],
  ["Low", "#27ae60"],
  ["Very Low", "#2980b9"],
];

export default function StyleGuide() {
  return (
    <StaticPageShell title="Design System">
      <StaticPageSection title="Colors">
        <div className="flex flex-wrap gap-3">
          {COLORS.map(([name, hex]) => (
            <div key={name} className="w-28 text-center">
              <div className="h-14 rounded-lg border border-line" style={{ background: hex }} />
              <div className="mt-1 text-xs font-semibold text-ink">{name}</div>
              <div className="text-[11px] text-faint">{hex}</div>
            </div>
          ))}
        </div>
      </StaticPageSection>

      <StaticPageSection title="Risk Tiers">
        <div className="flex flex-wrap gap-2">
          {RISK.map(([label, hex]) => (
            <span
              key={label}
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: `${hex}22`, color: hex }}
            >
              {label}
            </span>
          ))}
        </div>
      </StaticPageSection>

      <StaticPageSection title="Typography">
        <h1 className="m-0 text-3xl font-bold text-navy">Page Title / 30px bold</h1>
        <h2 className="m-0 text-xl font-bold text-primary">Section Heading / 20px bold</h2>
        <p className="m-0 text-[15px] text-muted">Body copy / 15px, muted gray, relaxed leading.</p>
        <p className="m-0 text-xs text-faint">Caption / 12px faint.</p>
      </StaticPageSection>

      <StaticPageSection title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark">
            Primary
          </button>
          <button className="rounded-lg border border-primary px-5 py-2.5 font-semibold text-primary transition hover:bg-card">
            Secondary
          </button>
          <button className="rounded-lg bg-[#a70000] px-5 py-2.5 font-semibold text-white">
            Danger
          </button>
        </div>
      </StaticPageSection>

      <StaticPageSection title="Async States">
        <AsyncSection loading>{null}</AsyncSection>
        <AsyncSection error="Something went wrong while loading this data." onRetry={() => {}}>{null}</AsyncSection>
        <AsyncSection empty emptyMessage="No data available">{null}</AsyncSection>
      </StaticPageSection>
    </StaticPageShell>
  );
}
