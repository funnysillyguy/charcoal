import { PenTool, SearchX } from './icons.jsx';
import CharacterTile from './discover/CharacterTile.jsx';
import { EmptyState, useUI } from './ui.jsx';

export default function CharacterGrid({ characters, query, tab }) {
  const ui = useUI();

  if (!characters.length) {
    if (query) {
      return (
        <EmptyState
          icon={SearchX}
          title={`Nobody matches “${query}”`}
          body="Try a name, a tag like “mystery”, or a creator handle. Or make the character you were looking for."
          action={
            <button type="button" className="btn btn-glow" onClick={() => ui.openCreator({ name: query })}>
              Create “{query.slice(0, 24)}”
            </button>
          }
        />
      );
    }
    if (tab === 'Custom') {
      return (
        <EmptyState
          icon={PenTool}
          title="You haven't made anyone yet"
          body="Characters you create show up here, including private and unlisted ones. Give them a voice, a greeting and a few example lines."
          action={
            <button type="button" className="btn btn-primary" onClick={() => ui.openCreator()}>
              Open the creation studio
            </button>
          }
        />
      );
    }
    return <EmptyState icon={SearchX} title="Nothing here yet" body="No public characters in this category." />;
  }

  return (
    <div className="tile-grid">
      {characters.map((c, i) => (
        <CharacterTile key={c.id} character={c} style={{ '--i': Math.min(i, 12) }} />
      ))}
    </div>
  );
}
