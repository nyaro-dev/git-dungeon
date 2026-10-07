import { index, type World } from "./world";

/**
 * Brouillard de guerre : cases révélées compte tenu des salles visitées.
 * Révélé = sol des salles visitées + couloirs (portes comprises) qui en partent
 * ou y mènent + murs qui bordent tout cela. Pur ; ~20 000 cases au pire.
 */
export function revealedTiles(world: World, visitedRooms: readonly number[]): Uint8Array {
  const { width, height, model } = world;
  const visited = new Set(visitedRooms);
  const walk = new Uint8Array(width * height);

  for (const id of visited) {
    const r = model.rooms[id]?.rect;
    if (!r) continue;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) walk[y * width + x] = 1;
  }
  for (const corridor of model.corridors) {
    if (!visited.has(corridor.from) && !visited.has(corridor.to)) continue;
    for (const p of [...corridor.doors, ...corridor.cells]) walk[index(world, p)] = 1;
  }

  const revealed = walk.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!walk[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) revealed[ny * width + nx] = 1;
        }
      }
    }
  }
  return revealed;
}
