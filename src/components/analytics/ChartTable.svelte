<script lang="ts">
  /**
   * A chart's numbers as a plain table that only screen readers see. A plot is pictures and pointer handlers; this is
   * the route to the same values for anyone who cannot point at it. The first cell of a row is its row header.
   */
  let { caption, columns, rows }: {
    caption: string;
    columns: string[];
    rows: (string | number)[][];
  } = $props();
</script>

<!-- The hiding class goes on a wrapper: a table ignores width and overflow, so a wide one on the table itself still
     widened the page (the finger load table, on a phone). -->
<div class="sr-only">
<table>
  <caption>{caption}</caption>
  <thead>
    <tr>{#each columns as c}<th scope="col">{c}</th>{/each}</tr>
  </thead>
  <tbody>
    {#each rows as row}
      <tr>
        {#each row as cell, i}
          {#if i === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
</div>
