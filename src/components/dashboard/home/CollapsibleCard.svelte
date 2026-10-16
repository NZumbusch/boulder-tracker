<script lang="ts">
  /**
   * Wraps one Home section so its header can fold the card. It gives the
   * `SectionHeader` inside a context (`collapse`) and marks itself
   * `data-collapsed`; app.css hides everything in the card after the header.
   * The state is a Home preference (`homeCollapsed`), remembered per card.
   * The Readiness hero has no header and is never wrapped as collapsible.
   */
  import { setContext, type Snippet } from 'svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeSectionId } from '../../../lib/preferences/migrate';
  import { HOME_COLLAPSE, isCollapsible } from '../../../lib/home/collapse';

  let { id, children }: { id: HomeSectionId; children: Snippet } = $props();
  const collapsible = $derived(isCollapsible(id));
  const collapsed = $derived(collapsible && trainingState.homeCollapsed.includes(id));

  setContext(HOME_COLLAPSE, {
    get enabled() { return collapsible; },
    get collapsed() { return collapsed; },
    toggle: () => trainingState.setHomeCollapsed(id, !collapsed),
  });
</script>

<div data-tour="home-{id}" data-collapsed={collapsed ? 'true' : undefined} class="empty:hidden">
  {@render children()}
</div>
