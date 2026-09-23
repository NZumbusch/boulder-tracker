<script lang="ts">
  /**
   * Appearance -> Plan. Week view stays a static "Day list" row rather than
   * a real toggle - the 7-column grid alternate is deferred;
   * offering "Grid" now would select a mode that renders nothing.
   */
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-3 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Week view</h3>
    <div class="p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 flex items-center justify-between">
      <span class="text-body text-content">Day list</span>
      <span class="text-caption text-content-subtle italic">Grid view coming in a future update</span>
    </div>
  </div>

</div>
