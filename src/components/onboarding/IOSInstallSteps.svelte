<script lang="ts">
  /** Safari's "Add to Home Screen" steps, for the welcome screen and Settings → About & Help. */
  import Icon from '@iconify/svelte';
</script>

<ol class="space-y-3">
  <li class="flex items-start gap-3">
    <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">1</span>
    <p class="text-body text-content leading-relaxed">
      In Safari, tap <Icon icon="ic:baseline-ios-share" class="inline text-lg text-primary -mt-1" /> <strong>Share</strong>
      <span class="text-content-subtle">(on newer iOS it may be under <Icon icon="ic:baseline-more-horiz" class="inline text-lg -mt-0.5" />)</span>.
    </p>
  </li>
  <li class="flex items-start gap-3">
    <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">2</span>
    <p class="text-body text-content leading-relaxed">Scroll down and tap <Icon icon="ic:outline-add-box" class="inline text-lg text-primary -mt-1" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p>
  </li>
  <li class="flex items-start gap-3">
    <span class="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-label flex items-center justify-center">3</span>
    <p class="text-body text-content leading-relaxed">Open <strong>Boulder Tracker</strong> from your Home Screen.</p>
  </li>
</ol>
