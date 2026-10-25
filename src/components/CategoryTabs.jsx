
export default function CategoryTabs({ tabs, active, onChange, counts }) {
  return (
    <div className="tabs" role="tablist" aria-label="Categories">
      {tabs.map((t) => {
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active === t}
            className={`tab ${active === t ? 'active' : ''}`}
            onClick={() => onChange(t)}
          >
            {t}
            {counts && <span className="tab-count">{counts[t] ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}
