import type { ExerciseSlot } from "../types";

/**
 * Keeping a session's exercise list sound: every slot once, with an id of
 * its own.
 *
 * Svelte keys the session's lists by slot id, so two slots with one id are
 * not a cosmetic glitch: the render throws (`each_key_duplicate`) and, as
 * the running session is persisted, it throws again on every start - the
 * app is stuck until its data is wiped (it happened on 2026-11-16, mid
 * session). The way in was drag and drop: `svelte-dnd-action` puts a
 * stand-in for the dragged card into the list while it moves (marked
 * `isDndShadowItem`, with the id below when it is outside the list), and
 * the session used to store each step of the drag, stand-in included.
 */

/** `svelte-dnd-action`'s marker and stand-in id (`SHADOW_ITEM_MARKER_PROPERTY_NAME`, `SHADOW_PLACEHOLDER_ITEM_ID`). */
export const DND_SHADOW_MARKER = "isDndShadowItem";
export const DND_PLACEHOLDER_ID = "id:dnd-shadow-placeholder-0000";

/**
 * The list with every slot once: drag stand-ins lose their marker, and a
 * slot whose id is taken (or is the stand-in id) is dropped when it is a
 * copy of a slot already kept, else kept under a new id - an exercise is
 * never lost to the repair. A sound list comes back as the same array.
 */
export function repairSlots(slots: ExerciseSlot[], newId: () => string = newSlotId): ExerciseSlot[] {
  const seen = new Set<string>();
  const kept: ExerciseSlot[] = [];
  const bodies = new Set<string>();
  let changed = false;
  for (const raw of slots) {
    let slot = raw;
    if (DND_SHADOW_MARKER in slot) {
      const { [DND_SHADOW_MARKER]: _marker, ...rest } = slot as ExerciseSlot & { [DND_SHADOW_MARKER]?: boolean };
      slot = rest as ExerciseSlot;
      changed = true;
    }
    const body = bodyOf(slot);
    if (slot.id === DND_PLACEHOLDER_ID || seen.has(slot.id)) {
      changed = true;
      if (bodies.has(body)) continue;
      slot = { ...slot, id: newId() };
    }
    seen.add(slot.id);
    bodies.add(body);
    kept.push(slot);
  }
  return changed ? kept : slots;
}

/**
 * The order a drop leaves, applied to the session's own slots: the dropped
 * list gives the order only. Stand-ins and ids the session doesn't have are
 * ignored, each slot counts once, and a slot the drop lost (a drag that
 * ended outside the list, or was cut short) goes back at its old place.
 */
export function settleDrop(current: ExerciseSlot[], dropped: { id: string }[]): ExerciseSlot[] {
  const byId = new Map(current.map((s) => [s.id, s]));
  const out: ExerciseSlot[] = [];
  const placed = new Set<string>();
  for (const item of dropped) {
    const slot = byId.get(item.id);
    if (!slot || placed.has(item.id)) continue;
    placed.add(item.id);
    out.push(slot);
  }
  current.forEach((slot, i) => {
    if (placed.has(slot.id)) return;
    placed.add(slot.id);
    out.splice(Math.min(i, out.length), 0, slot);
  });
  return out;
}

function newSlotId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function bodyOf(slot: ExerciseSlot): string {
  const { id: _id, ...rest } = slot;
  return JSON.stringify(rest);
}
