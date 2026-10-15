<script lang="ts">
  /**
   * Where you train (`lib/places`): home, crags, gyms, anywhere. Each place has a name (renamable - the sessions that
   * name it follow), a kind, coordinates (found by a city search, pasted from a map app, or typed - they are what the
   * weather uses), and optionally a price, opening hours and a note, all plain text. A session picks a place by name;
   * the AI coach reads them. Kept on this device.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { toast } from '../../lib/toast.svelte';
  import { showConfirm } from '../../lib/utils';
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

  async function remove(place: Place) {
    if (!(await showConfirm('Remove place', `Remove ${place.name}? Sessions that name it keep the name as text.`))) return;
    await save(places.filter((p) => p !== place));
    open = null;
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

  const field = 'w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-body focus:border-primary/50';
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
    {#each places as place, i (place.name)}
      {@const isOpen = open !== null && samePlaceName(open, place.name)}
      <div class="py-1">
        <button onclick={() => (open = isOpen ? null : place.name)} class="w-full flex items-center gap-3 py-2.5 text-left" aria-expanded={isOpen}>
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
              <input type="text" maxlength="80" value={place.name} onchange={(e) => void rename(place.name, e.currentTarget.value)} class={field} />
            </label>

            <div class="flex bg-surface-elevated/50 p-1 rounded-control" role="radiogroup" aria-label="Kind of place">
              {#each PLACE_KINDS as kind}
                <button role="radio" aria-checked={place.kind === kind} onclick={() => void patch(place.name, { kind })} class="flex-1 py-2 text-label rounded-control transition-all {place.kind === kind ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">{PLACE_KIND_LABELS[kind]}</button>
              {/each}
            </div>

            <div class="space-y-2">
              <p class="text-label text-content-subtle">Where on the map {hasCoordinates(place) ? `· ${place.latitude!.toFixed(4)}, ${place.longitude!.toFixed(4)}` : '· none yet (no weather for it)'}</p>
              <div class="flex gap-2">
                <input type="text" bind:value={query} placeholder="Search a city or village" class={field} data-own-enter onkeydown={(e) => e.key === 'Enter' && search()} />
                <button onclick={search} disabled={searching} class="px-3 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-label font-bold rounded-control">{searching ? '…' : 'Search'}</button>
              </div>
              {#if results.length > 0}
                <div class="space-y-1 max-h-40 overflow-y-auto">
                  {#each results as r}
                    <button onclick={() => void setCoordinates(place.name, r.latitude, r.longitude)} class="w-full text-left px-3 py-2 bg-surface-elevated hover:bg-surface-elevated-hover rounded-control text-body text-content">{r.name}{r.countryCode ? `, ${r.countryCode}` : ''}</button>
                  {/each}
                </div>
              {:else if query.trim() && !searching}
                <p class="text-caption text-content-subtle italic">Nothing found - a crag is rarely a city: paste its coordinates below instead.</p>
              {/if}
              <div class="flex gap-2">
                <input type="text" bind:value={pasted} placeholder="Or paste coordinates: 47.0502, 8.3093" class={field} data-own-enter onkeydown={(e) => e.key === 'Enter' && applyPasted(place.name)} />
                <button onclick={() => applyPasted(place.name)} disabled={!pasted.trim()} class="px-3 py-2 bg-surface-elevated text-content text-label font-bold rounded-control disabled:opacity-40">Set</button>
              </div>
              <div class="flex items-center gap-4">
                <a href={mapsLink(place)} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-label font-bold text-primary">Open in Maps <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
                {#if hasCoordinates(place)}
                  <button onclick={() => void patch(place.name, { latitude: undefined, longitude: undefined })} class="text-label text-content-subtle hover:text-danger">Remove coordinates</button>
                {/if}
              </div>
              <p class="text-caption text-content-subtle">Long-press a spot in your maps app and copy the coordinates to find one that search doesn't know.</p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1"><span class="text-label text-content-subtle">Price</span>
                <input type="text" maxlength="80" value={place.price ?? ''} placeholder="CHF 22 day pass" onchange={(e) => void patch(place.name, { price: text(e.currentTarget.value) })} class={field} /></label>
              <label class="block space-y-1"><span class="text-label text-content-subtle">Opening hours</span>
                <input type="text" maxlength="200" value={place.hours ?? ''} placeholder="Mon-Fri 9-22" onchange={(e) => void patch(place.name, { hours: text(e.currentTarget.value) })} class={field} /></label>
            </div>
            <label class="block space-y-1"><span class="text-label text-content-subtle">Notes</span>
              <textarea rows="2" maxlength="1000" value={place.notes ?? ''} placeholder="What the coach should know: boards, walls that dry first, how to get in" onchange={(e) => void patch(place.name, { notes: text(e.currentTarget.value) })} class="{field} resize-none"></textarea></label>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <button onclick={() => void move(i, -1)} disabled={i === 0} class="tap p-1.5 text-content-subtle hover:text-content disabled:opacity-25" aria-label="Move {place.name} up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
                <button onclick={() => void move(i, 1)} disabled={i === places.length - 1} class="tap p-1.5 text-content-subtle hover:text-content disabled:opacity-25" aria-label="Move {place.name} down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
              </div>
              <button onclick={() => void remove(place)} class="text-label text-content-subtle hover:text-danger transition-colors">Remove place</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <div class="pt-3">
      {#if adding}
        <div class="space-y-2 animate-in fade-in">
          <input type="text" maxlength="80" bind:value={newName} placeholder="Name: Steinbock Konstanz, Brione, Home" class={field} data-own-enter onkeydown={(e) => e.key === 'Enter' && add()} />
          <div class="flex bg-surface-elevated/50 p-1 rounded-control" role="radiogroup" aria-label="Kind of place">
            {#each PLACE_KINDS as kind}
              <button role="radio" aria-checked={newKind === kind} onclick={() => (newKind = kind)} class="flex-1 py-2 text-label rounded-control transition-all {newKind === kind ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">{PLACE_KIND_LABELS[kind]}</button>
            {/each}
          </div>
          <div class="flex gap-2">
            <button onclick={add} disabled={!newName.trim()} class="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-label font-bold rounded-control">Add place</button>
            <button onclick={() => { adding = false; newName = ''; }} class="px-4 py-2.5 bg-surface-elevated text-content-muted text-label rounded-control">Cancel</button>
          </div>
        </div>
      {:else}
        <button onclick={() => (adding = true)} class="w-full py-2.5 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5">
          <Icon icon="ic:baseline-plus" class="text-base" /> Add a place
        </button>
      {/if}
    </div>
  </div>
</div>
