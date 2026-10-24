import { BookHeart, Brain, Gamepad2, LayoutGrid, LifeBuoy, PawPrint, PenTool, Sparkles } from 'lucide-react';

const ICONS = {
  All: LayoutGrid,
  Furry: PawPrint,
  Anime: Sparkles,
  Gaming: Gamepad2,
  Helpers: LifeBuoy,
  Roleplay: BookHeart,
  Philosophy: Brain,
  Custom: PenTool,
};

export default function CategoryTabs({ tabs, active, onChange, counts }) {
  return (
    <div className="tabs" role="tablist" aria-label="Categories">
      {tabs.map((t) => {
        const Icon = ICONS[t] || LayoutGrid;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active === t}
            className={`tab ${active === t ? 'active' : ''}`}
            onClick={() => onChange(t)}
          >
            <Icon size={15} />
            {t}
            {counts && <span className="tab-count">{counts[t] ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}
