<script lang="ts">
  /**
   * What's new: the latest changes, newest first - a short header each, and
   * its detail when tapped. Written from git when the app is built: the
   * commit's subject, or its `Changelog:` line (scripts/changelog.mjs).
   */
  import Icon from '@iconify/svelte';
  import { CHANGELOG } from '../../lib/appInfo';

  const SHOWN = 6;
  let all = $state(false);
  let open = $state<string | null>(null);
  const entries = $derived(all ? CHANGELOG : CHANGELOG.slice(0, SHOWN));
  const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

{#if CHANGELOG.length > 0}
  <section class="card space-y-1 animate-in fade-in" aria-labelledby="about-new">
    <h2 id="about-new" class="text-section uppercase text-content-muted px-1 pb-1">What's new</h2>
    <div class="divide-y divide-border">
      {#each entries as e (e.hash)}
        {#if e.detail}
          <button onclick={() => (open = open === e.hash ? null : e.hash)} aria-expanded={open === e.hash} class="w-full py-2.5 min-h-11 text-left">
            <span class="flex items-center gap-2">
              <span class="min-w-0 flex-1 text-body font-semibold text-content truncate">{e.title}</span>
              <span class="text-caption text-content-subtle shrink-0 tabular-nums">{date(e.date)}</span>
              <Icon icon="ic:baseline-expand-more" class="text-lg text-content-subtle shrink-0 transition-transform {open === e.hash ? 'rotate-180' : ''}" />
            </span>
            {#if open === e.hash}
              <span class="block mt-1.5 text-caption text-content-muted leading-relaxed break-words animate-in fade-in duration-150">{e.detail}</span>
            {/if}
          </button>
        {:else}
          <div class="py-2.5 flex items-center gap-2">
            <span class="min-w-0 flex-1 text-body font-semibold text-content truncate">{e.title}</span>
            <span class="text-caption text-content-subtle shrink-0 tabular-nums">{date(e.date)}</span>
            <span class="w-[18px] shrink-0" aria-hidden="true"></span>
          </div>
        {/if}
      {/each}
    </div>
    {#if CHANGELOG.length > SHOWN}
      <button onclick={() => (all = !all)} class="btn-quiet px-2 text-label text-primary">{all ? 'Show fewer' : `Show ${CHANGELOG.length - SHOWN} older`}</button>
    {/if}
  </section>
{/if}
