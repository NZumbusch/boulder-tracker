<script lang="ts">
  /**
   * A circuit/superset as the workout modal shows it: one card holding its
   * members, with the group's timing as a header line. The members are
   * rendered by the caller (view and edit draw them differently); `header`
   * replaces the read-only title in the editor.
   */
  import type { Snippet } from 'svelte';
  import type { ExerciseGroup } from '../../lib/types';
  import { groupSummary } from '../../lib/exercise/groups';
  import { formatMinutes } from '../../lib/session/formatSession';
  import Icon from '@iconify/svelte';

  let {
    group,
    minutes,
    header,
    children,
  }: {
    group: ExerciseGroup;
    /** The group's estimated length, if known. */
    minutes?: number;
    header?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="rounded-card border border-border bg-surface/25 p-2 space-y-2">
  {#if header}
    {@render header()}
  {:else}
    <div class="px-1.5 pt-1">
      <p class="text-caption uppercase text-content-subtle flex items-center gap-1">
        <Icon icon="ic:baseline-repeat" class="text-sm" /> Circuit
      </p>
      <p class="text-body font-bold text-content break-words">{group.name || 'Circuit'}</p>
      <p class="text-caption text-content-subtle">
        {groupSummary(group)}{#if minutes} · ~{formatMinutes(Math.ceil(minutes))}{/if}
      </p>
    </div>
  {/if}
  <div class="space-y-2">
    {@render children()}
  </div>
</section>
