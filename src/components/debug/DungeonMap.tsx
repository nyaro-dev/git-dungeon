import { TILE, type DungeonModel } from "@/lib/dungeon/types";

const TILE_FILL: Record<string, string> = {
  [TILE.wall]: "#3f3f46",
  [TILE.floor]: "#d6d3d1",
  [TILE.corridor]: "#a8a29e",
  [TILE.door]: "#b45309",
};

const ROOM_FILL: Record<string, string> = {
  hall: "#bbf7d0",
  antechamber: "#fecaca",
  head: "#ddd6fe",
};

/**
 * Vue 2D de debug d'un donjon : une case = une unité SVG. Les cases identiques
 * consécutives d'une ligne sont fusionnées pour limiter le nombre de nœuds.
 */
export function DungeonMap({ model, scale = 6 }: { model: DungeonModel; scale?: number }) {
  const runs: { x: number; y: number; w: number; fill: string }[] = [];
  model.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const t = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === t) end++;
      if (TILE_FILL[t]) runs.push({ x, y, w: end - x, fill: TILE_FILL[t] });
      x = end;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${model.width} ${model.height}`}
      width={model.width * scale}
      height={model.height * scale}
      className="max-w-full h-auto bg-zinc-900"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Carte du donjon de ${model.repo.fullName}`}
    >
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
      {model.rooms
        .filter((room) => ROOM_FILL[room.kind])
        .map((room) => (
          <rect
            key={`room-${room.id}`}
            x={room.rect.x}
            y={room.rect.y}
            width={room.rect.w}
            height={room.rect.h}
            fill={ROOM_FILL[room.kind]}
          />
        ))}
      <rect x={model.sealedDoor.x} y={model.sealedDoor.y} width={1} height={1} fill="#7c3aed" />
      {model.chests.map((c) => (
        <rect key={`chest-${c.id}`} x={c.pos.x + 0.15} y={c.pos.y + 0.15} width={0.7} height={0.7} fill="#eab308">
          <title>{`${c.file} — ${c.item} (${c.rarity})`}</title>
        </rect>
      ))}
      {model.monsters.map((m) => (
        <circle key={`monster-${m.id}`} cx={m.pos.x + 0.5} cy={m.pos.y + 0.5} r={0.4} fill="#ea580c">
          <title>{m.issue ? `#${m.issue.number} ${m.issue.title} (${m.kind})` : "TODO"}</title>
        </circle>
      ))}
      {model.npcs.map((n) => (
        <circle key={`npc-${n.id}`} cx={n.pos.x + 0.5} cy={n.pos.y + 0.5} r={0.4} fill="#2563eb">
          <title>{n.login}</title>
        </circle>
      ))}
      <circle cx={model.boss.pos.x + 0.5} cy={model.boss.pos.y + 0.5} r={0.7} fill="#dc2626">
        <title>{`Boss : ${model.boss.name}`}</title>
      </circle>
      <circle cx={model.spawn.x + 0.5} cy={model.spawn.y + 0.5} r={0.5} fill="#16a34a">
        <title>Héros</title>
      </circle>
      {model.rooms.map((room) => (
        <text
          key={`label-${room.id}`}
          x={room.rect.x + room.rect.w / 2}
          y={room.rect.y - 1.4}
          fontSize={1.6}
          textAnchor="middle"
          fill="#f4f4f5"
        >
          {room.name}
        </text>
      ))}
    </svg>
  );
}
