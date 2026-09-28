<script lang="ts">
  import { scopedUndo } from '../../lib/toast.svelte';
  import { generateId, showAlert } from '../../lib/utils';
  import type { BenchmarkTypeDef } from '../../lib/types';
  import Icon from "@iconify/svelte";

  let { benchmarkTypes = $bindable() }: { benchmarkTypes: BenchmarkTypeDef[] } = $props();

  let editingBenchmarkType = $state<BenchmarkTypeDef | null>(null);
  let isAddingBenchmark = $state(false);

  function startAddBenchmark() {
    editingBenchmarkType = {
      id: generateId(),
      name: 'New Benchmark',
      unit: 'kg'
    };
    isAddingBenchmark = true;
  }

  function saveBenchmarkType() {
    if (!editingBenchmarkType) return;

    const name = editingBenchmarkType.name.trim();
    if (!name) {
      showAlert('Input Error', 'Benchmark name cannot be empty.');
      return;
    }

    const isDuplicate = benchmarkTypes.some(t =>
      t.id !== editingBenchmarkType?.id &&
      t.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A benchmark with this name already exists.');
      return;
    }

    const index = benchmarkTypes.findIndex(t => t.id === editingBenchmarkType?.id);
    if (index !== -1) {
      benchmarkTypes[index] = { ...editingBenchmarkType, name };
    } else {
      benchmarkTypes.push({ ...editingBenchmarkType, name });
    }
    // Closing is enough: nulling the edited object too would make the
    // form's still-bound inputs read `.name` of null before the form is gone.
    isAddingBenchmark = false;
  }

  const undoable = scopedUndo();
  /** Logged results stay; they're just unlinked until Undo puts the type back. */
  function deleteBenchmarkType(id: string) {
    const index = benchmarkTypes.findIndex(t => t.id === id);
    if (index === -1) return;
    const removed = $state.snapshot(benchmarkTypes[index]) as BenchmarkTypeDef;
    benchmarkTypes = benchmarkTypes.filter(t => t.id !== id);
    undoable(`${removed.name} deleted`, () => {
      if (!benchmarkTypes.some(t => t.id === removed.id)) benchmarkTypes = [...benchmarkTypes.slice(0, index), removed, ...benchmarkTypes.slice(index)];
    });
  }
</script>

<div class="card space-y-4">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Benchmark Types</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Periodic performance tests (max hang, max pull-up, ...) tracked over time. These are separate from Exercise Modalities — you log a result under "Benchmark Tests" on the Training Plan screen, not as part of a workout.</p>
  </div>

  {#if isAddingBenchmark && editingBenchmarkType}
    <div class="p-5 bg-surface-elevated/50 border border-success/30 rounded-card space-y-4 animate-in zoom-in-95 shadow-inner">
      <div class="space-y-3">
        <div class="space-y-1"><label for="bench-name" class="text-label text-content-subtle ml-1">Test Name</label><input id="bench-name" bind:value={editingBenchmarkType.name} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-success outline-none text-sm" placeholder="e.g., 20mm Max Hang" /></div>
        <div class="space-y-1"><label for="bench-unit" class="text-label text-content-subtle ml-1">Result Unit</label><input id="bench-unit" bind:value={editingBenchmarkType.unit} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-success outline-none text-sm" placeholder="e.g., kg, reps, s" /></div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={saveBenchmarkType} class="flex-1 py-3 bg-success text-white text-sm font-bold rounded-control">Save</button><button onclick={() => isAddingBenchmark = false} class="px-5 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button></div>
    </div>
  {:else}
    <div class="divide-y divide-border">
      {#each benchmarkTypes as type}
        <div class="flex items-center justify-between py-3 group">
          <div><p class="text-body font-bold text-content">{type.name}</p><p class="text-caption text-content-subtle">Unit: {type.unit}</p></div>
          <div class="flex items-center gap-1">
            <button onclick={() => { editingBenchmarkType = { ...type }; isAddingBenchmark = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Edit Benchmark"><Icon icon="ic:baseline-edit" /></button>
            <button onclick={() => deleteBenchmarkType(type.id)} class="p-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Benchmark"><Icon icon="ic:baseline-delete" /></button>
          </div>
        </div>
      {/each}
      <button onclick={startAddBenchmark} class="w-full py-3 rounded-control hover:bg-surface-elevated/50 flex items-center justify-center gap-2 text-primary transition-colors"><Icon icon="ic:baseline-plus" /><span class="text-label">Add Benchmark Type</span></button>
    </div>
  {/if}
</div>
