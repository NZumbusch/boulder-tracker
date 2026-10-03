<script lang="ts">
  /**
   * What each way of running the app can do - the welcome's "what works
   * where" step. Kept in step with the table on public/about.html and the
   * README by hand; the facts come from the code (sync, widgets, shortcuts,
   * reminders and Health Connect are Android-only; see README "What the web
   * app can't do").
   */
  const COLUMNS = ['Android app', 'iPhone Home Screen', 'Browser'];
  type Cell = [text: string, good: boolean];
  const ROWS: [string, Cell, Cell, Cell][] = [
    ['Works offline', ['Yes', true], ['Yes', true], ['Once loaded', true]],
    ['Google Drive sync', ['Yes', true], ['No', false], ['No', false]],
    ['Reminders', ['Yes', true], ['No', false], ['No', false]],
    ['Timer sound, screen locked', ['Yes', true], ['No: keep the screen on', false], ['No: keep the screen on', false]],
    ['Widgets, shortcuts', ['Yes', true], ['No', false], ['No', false]],
    ['Health Connect import', ['Yes', true], ['No', false], ['No', false]],
    ['Backups', ['Automatic, weekly', true], ['By hand', false], ['By hand', false]],
  ];
</script>

<div class="overflow-x-auto no-scrollbar -mx-1">
  <table class="w-full text-caption border-separate border-spacing-0">
    <thead>
      <tr>
        <th class="text-left font-normal text-content-subtle pb-2 pr-2"></th>
        {#each COLUMNS as c}<th class="text-left font-semibold text-content pb-2 px-1.5 align-bottom">{c}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each ROWS as [label, ...cells]}
        <tr>
          <th scope="row" class="text-left font-normal text-content-muted py-2 pr-2 border-t border-border align-top">{label}</th>
          {#each cells as [text, good]}
            <td class="py-2 px-1.5 border-t border-border align-top {good ? 'text-content' : 'text-content-subtle'}">{text}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
