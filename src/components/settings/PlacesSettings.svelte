<script lang="ts">
  /**
   * Where you train (`lib/places`): home, crags, gyms, anywhere. Each place has a name (renamable - the sessions that
   * name it follow), a kind, coordinates (found by a city search, pasted from a map app, or typed - they are what the
   * weather uses), and optionally a price, opening hours and a note, all plain text. A session picks a place by name;
   * the AI coach reads them. Kept on this device.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { toast, showUndo } from '../../lib/toast.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { PLACE_KINDS, PLACE_KIND_LABELS, hasCoordinates, parseCoordinates, placeLine, samePlaceName, validatePlace, type Place, type PlaceKind } from '../../lib/places/places';
  import { mapsUrl } from '../../lib/calendar/eventText';

  const places = $derived(trainingState.places);
  /** The place whose editor is open (by name), or null. */
  let open = $state<string | null>(null);

  async function save(list: Place[]) {
    await trainingState.setPlaces(list);
  }
  /** Changes one place; the home stays the only one of its kind (a second one demotes the first to "other"). */
  async function patch(name: string, changes: Partial<Place>) {
    const next = places.map((p) => (samePlaceName(p.name, name) ? { ...p, ...changes } : changes.kind === 'home' && p.kind === 'home' ? { ...p, kind: 'other' as const } : p));
    await save(next.map((p) => validatePlace(p) ?? p));
  }
  /** Clears a text field: an empty string removes the key. */
  const text = (v: string) => (v.trim() === '' ? undefined : v.trim());

  async function rename(from: string, to: string) {
    if (to.trim() === from) return;
    if (!(await trainingState.renamePlace(from, to))) {
      toast.show(to.trim() ? `Another place is already called ${to.trim()}` : 'A place needs a name');
      return;
    }
    open = to.trim();
  }

  /** Removing a place can be taken back: sessions that name it keep the name as text either way. */
  async function remove(place: Place) {
    const before = [...places];
    await save(places.filter((p) => p !== place));
    open = null;
    showUndo(`${place.name} removed`, () => save(before));
  }
  async function removeCoordinates(place: Place) {
    const before = [...places];
    await patch(place.name, { latitude: undefined, longitude: undefined });
    showUndo(`Coordinates of ${place.name} removed`, () => save(before));
  }
  async function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= places.length) return;
    const next = [...places];
    [next[index], next[to]] = [next[to], next[index]];
    await save(next);
  }

  // --- Adding ---
  let adding = $state(false);
  let newName = $state('');
  let newKind = $state<PlaceKind>('crag');
  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (places.some((p) => samePlaceName(p.name, name))) { toast.show(`${name} is already one of your places`); return; }
    await save([...places, { name, kind: newKind === 'home' && places.some((p) => p.kind === 'home') ? 'other' : newKind }]);
    open = name;
    adding = false;
    newName = '';
  }

  // --- Coordinates ---
  let query = $state('');
  let searching = $state(false);
  let results = $state<{ name: string; countryCode?: string; latitude: number; longitude: number }[]>([]);
  let pasted = $state('');
  async function search() {
    if (!query.trim()) { results = []; return; }
    searching = true;
    results = await trainingState.geocodeCity(query);
    searching = false;
  }
  async function setCoordinates(name: string, latitude: number, longitude: number) {
    await patch(name, { latitude, longitude });
    results = [];
    query = '';
    pasted = '';
  }
  async function applyPasted(name: string) {
    const c = parseCoordinates(pasted);
    if (!c) { toast.show('Not coordinates - paste "47.0502, 8.3093" as a map app copies it'); return; }
    await setCoordinates(name, c.latitude, c.longitude);
  }
  const mapsLink = (p: Place) => (hasCoordinates(p) ? mapsUrl(`${p.latitude},${p.longitude}`) : mapsUrl(p.name));
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Places</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Where you train: home, crags, gyms. A session can say where it is (pick one of these or type any place), the AI coach knows them, and the weather
      (Open-Meteo, no account) is read for the home and the crags that have coordinates. Kept on this device.
    </p>
  </div>

  <div class="divide-y divide-border">
    {#if places.length === 0 && !adding}
      <p class="text-caption text-content-subtle py-2 px-1">No places yet. Add your home to get its weather on Home, and your crags and gyms to pick them for a session.</p>
    {/if}
    {#each places as place, i (place.name)}
      {@const isOpen = open !== null && samePlaceName(open, place.name)}
      <div class="py-1">
        <button onclick={() => (open = isOpen ? null : place.name)} class="w-full flex items-center gap-3 py-2.5 min-h-11 text-left" aria-expanded={isOpen}>
          <span class="min-w-0 flex-1">
            <span class="block text-body text-content truncate">{place.name}</span>
            <span class="block text-caption text-content-subtle truncate">{placeLine(place)}{hasCoordinates(place) ? '' : ' · no coordinates'}</span>
          </span>
          <Icon icon={isOpen ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-xl text-content-subtle shrink-0" />
        </button>

        {#if isOpen}
          <div class="space-y-3 pb-3 animate-in fade-in">
            <label class="block space-y-1">
              <span class="text-label text-content-subtle">Name</span>
              <input type="text" maxlength="80" value={place.name} onchange={(e) => void rename(place.name, e.currentTarget.value)} class="field" />
            </label>

            <Segmented
              variant="setting"
              full
              label="Kind of place"
              value={place.kind}
              onChange={(kind) => void patch(place.name, { kind })}
              options={PLACE_KINDS.map((kind) => ({ value: kind, label: PLACE_KIND_LABELS[kind] }))}
            />

            <div class="space-y-2">
              <p class="text-label text-content-subtle">Where on the map {hasCoordinates(place) ? `· ${place.latitude!.toFixed(4)}, ${place.longitude!.toFixed(4)}` : '· none yet (no weather for it)'}</p>
              <div class="flex gap-2">
                <input type="text" bind:value={query} placeholder="Search a city or village" class="field" data-own-enter onkeydown={(e) => e.key === 'Enter' && search()} />
                <button onclick={search} disabled={searching} class="btn btn-primary shrink-0">{searching ? 'Searching…' : 'Search'}</button>
              </div>
              {#if results.length > 0}
                <div class="space-y-1">
                  {#each results as r}
                    <button onclick={() => void setCoordinates(place.name, r.latitude, r.longitude)} class="w-full text-left px-3 py-2 min-h-11 bg-surface-elevated hover:bg-surface-elevated-hover rounded-control text-body text-content">{r.name}{r.countryCode ? `, ${r.countryCode}` : ''}</button>
                  {/each}
                </div>
              {:else if query.trim() && !searching}
                <p class="text-caption text-content-subtle italic">Nothing found, or no connection. A crag is rarely a city: paste its coordinates below instead.</p>
              {/if}
              <div class="flex gap-2">
                <input type="text" bind:value={pasted} placeholder="Or paste coordinates: 47.0502, 8.3093" class="field" data-own-enter onkeydown={(e) => e.key === 'Enter' && applyPasted(place.name)} />
                <button onclick={() => applyPasted(place.name)} disabled={!pasted.trim()} class="btn btn-secondary shrink-0">Set</button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <a href={mapsLink(place)} target="_blank" rel="noopener" class="btn-quiet gap-1 px-2 text-label font-bold text-primary">Open in Maps <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
                {#if hasCoordinates(place)}
                  <button onclick={() => void removeCoordinates(place)} class="btn-quiet px-2 text-label text-content-muted hover:text-danger">Remove coordinates</button>
                {/if}
              </div>
              <p class="text-caption text-content-subtle">Long-press a spot in your maps app and copy the coordinates to find one that search doesn't know.</p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1"><span class="text-label text-content-subtle">Price</span>
                <input type="text" maxlength="80" value={place.price ?? ''} placeholder="CHF 22 day pass" onchange={(e) => void patch(place.name, { price: text(e.currentTarget.value) })} class="field" /></label>
              <label class="block space-y-1"><span class="text-label text-content-subtle">Opening hours</span>
                <input type="text" maxlength="200" value={place.hours ?? ''} placeholder="Mon-Fri 9-22" onchange={(e) => void patch(place.name, { hours: text(e.currentTarget.value) })} class="field" /></label>
            </div>
            <label class="block space-y-1"><span class="text-label text-content-subtle">Notes</span>
              <textarea rows="2" maxlength="1000" value={place.notes ?? ''} placeholder="What the coach should know: boards, walls that dry first, how to get in" onchange={(e) => void patch(place.name, { notes: text(e.currentTarget.value) })} class="field resize-none"></textarea></label>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <button onclick={() => void move(i, -1)} disabled={i === 0} class="btn-icon disabled:opacity-25" aria-label="Move {place.name} up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
                <button onclick={() => void move(i, 1)} disabled={i === places.length - 1} class="btn-icon disabled:opacity-25" aria-label="Move {place.name} down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
              </div>
              <button onclick={() => void remove(place)} class="btn btn-danger">Remove place</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <div class="pt-3">
      {#if adding}
        <div class="space-y-2 animate-in fade-in">
          <input type="text" maxlength="80" bind:value={newName} placeholder="Name, for example Brione or Home" class="field" data-own-enter onkeydown={(e) => e.key === 'Enter' && add()} />
          <Segmented
            variant="setting"
            full
            label="Kind of place"
            value={newKind}
            onChange={(kind) => (newKind = kind)}
            options={PLACE_KINDS.map((kind) => ({ value: kind, label: PLACE_KIND_LABELS[kind] }))}
          />
          <div class="flex gap-2">
            <button onclick={add} disabled={!newName.trim()} class="btn btn-primary flex-1">Add place</button>
            <button onclick={() => { adding = false; newName = ''; }} class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      {:else}
        <button onclick={() => (adding = true)} class="w-full min-h-11 py-2.5 rounded-control border border-dashed border-border-strong text-label font-bold text-content-muted hover:text-primary transition-colors flex items-center justify-center gap-1.5">
          <Icon icon="ic:baseline-plus" class="text-base" /> Add a place
        </button>
      {/if}
    </div>
  </div>
</div>
