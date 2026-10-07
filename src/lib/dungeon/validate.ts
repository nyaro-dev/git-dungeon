import { ROOM_GAP, tooClose } from "./layout";
import { MAX_MONSTERS, MAX_MONSTERS_PER_ROOM } from "./populate";
import { TILE, type DungeonModel, type Point } from "./types";

const WALKABLE = new Set<string>([TILE.floor, TILE.corridor, TILE.door]);

/** Cases atteignables depuis `start` (4-voisinage), `closed` étant traitée comme un mur. */
function reachable(model: DungeonModel, start: Point, closed?: Point): Uint8Array {
  const seen = new Uint8Array(model.width * model.height);
  const stack: Point[] = [start];
  seen[start.y * model.width + start.x] = 1;
  while (stack.length > 0) {
    const p = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= model.width || y >= model.height) continue;
      if (seen[y * model.width + x]) continue;
      if (closed && closed.x === x && closed.y === y) continue;
      if (!WALKABLE.has(model.rows[y][x])) continue;
      seen[y * model.width + x] = 1;
      stack.push({ x, y });
    }
  }
  return seen;
}

/**
 * Invariants d'un donjon jouable. Renvoie la liste des violations (vide = valide).
 * Utilisé par les tests ; peu coûteux, il peut aussi garder la route d'API.
 */
export function validateDungeon(model: DungeonModel): string[] {
  const errors: string[] = [];
  const tile = (p: Point) => model.rows[p.y]?.[p.x];

  if (model.rows.length !== model.height || model.rows.some((row) => row.length !== model.width)) {
    errors.push("grille : dimensions incohérentes");
    return errors;
  }

  const count = (kind: string) => model.rooms.filter((room) => room.kind === kind).length;
  if (count("hall") !== 1) errors.push(`hall : ${count("hall")} au lieu de 1`);
  if (count("antechamber") !== 1) errors.push(`antichambre : ${count("antechamber")} au lieu de 1`);
  if (count("head") !== 1) errors.push(`HEAD : ${count("head")} au lieu de 1`);
  const head = model.rooms[model.exitRoomId];
  if (head?.kind !== "head") errors.push("exitRoomId ne désigne pas HEAD");
  if (model.rooms[model.entranceRoomId]?.kind !== "hall") errors.push("entranceRoomId ne désigne pas le hall");
  if (model.rooms[model.boss.roomId]?.kind !== "antechamber") errors.push("le boss n'est pas dans l'antichambre");

  for (let i = 0; i < model.rooms.length; i++) {
    for (let j = i + 1; j < model.rooms.length; j++) {
      if (tooClose(model.rooms[i].rect, model.rooms[j].rect, ROOM_GAP)) {
        errors.push(`salles ${i} et ${j} trop proches ou superposées`);
      }
    }
    const r = model.rooms[i].rect;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (tile({ x, y }) !== TILE.floor) {
          errors.push(`salle ${i} : case (${x}, ${y}) n'est pas du sol`);
          y = r.y + r.h;
          break;
        }
      }
    }
  }

  if (tile(model.sealedDoor) !== TILE.door) errors.push("la porte scellée n'est pas une porte");

  const open = reachable(model, model.spawn);
  for (const room of model.rooms) {
    const c = { x: room.rect.x, y: room.rect.y };
    if (!open[c.y * model.width + c.x]) errors.push(`salle ${room.id} (${room.path}) inatteignable`);
  }
  if (head) {
    const sealed = reachable(model, model.spawn, model.sealedDoor);
    if (sealed[head.rect.y * model.width + head.rect.x]) errors.push("HEAD atteignable sans passer par le boss");
  }

  const occupied = new Set<string>();
  const place = (what: string, roomId: number, p: Point) => {
    const r = model.rooms[roomId]?.rect;
    if (!r || p.x < r.x || p.y < r.y || p.x >= r.x + r.w || p.y >= r.y + r.h) {
      errors.push(`${what} hors de sa salle`);
    }
    const key = `${p.x},${p.y}`;
    if (occupied.has(key)) errors.push(`${what} : case (${key}) déjà occupée`);
    occupied.add(key);
  };
  place("héros", model.entranceRoomId, model.spawn);
  place("boss", model.boss.roomId, model.boss.pos);
  for (const npc of model.npcs) place(`PNJ ${npc.login}`, npc.roomId, npc.pos);
  for (const chest of model.chests) place(`coffre ${chest.file}`, chest.roomId, chest.pos);

  if (model.monsters.length > MAX_MONSTERS) errors.push(`${model.monsters.length} monstres (max ${MAX_MONSTERS})`);
  const perRoom = new Map<number, number>();
  for (const monster of model.monsters) {
    place(`monstre ${monster.id}`, monster.roomId, monster.pos);
    if (model.rooms[monster.roomId]?.kind !== "room") errors.push(`monstre ${monster.id} dans une salle interdite`);
    perRoom.set(monster.roomId, (perRoom.get(monster.roomId) ?? 0) + 1);
  }
  for (const [roomId, n] of perRoom) {
    if (n > MAX_MONSTERS_PER_ROOM) errors.push(`salle ${roomId} : ${n} monstres (max ${MAX_MONSTERS_PER_ROOM})`);
  }

  return errors;
}
