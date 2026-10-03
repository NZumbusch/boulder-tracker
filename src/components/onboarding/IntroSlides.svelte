<script lang="ts">
  /**
   * Three real screens of the app (public/img, rendered from the example
   * data) on the welcome's first page: swipe sideways, dots below. Plain
   * scroll-snap, so it works with touch, trackpad and keyboard, and needs no
   * animation to respect the reduced-motion setting.
   */
  const SLIDES = [
    { src: './img/intro-home.webp', title: 'Home', text: "Today's session, readiness and what needs a look." },
    { src: './img/intro-plan.webp', title: 'Plan', text: 'Phases and weeks, with a Plan B for uncertain days.' },
    { src: './img/intro-analytics.webp', title: 'Analytics', text: 'Load, fatigue and progress over time.' },
  ];

  let scroller = $state<HTMLDivElement>();
  let active = $state(0);

  function onScroll() {
    if (!scroller) return;
    const slide = scroller.firstElementChild as HTMLElement | null;
    if (!slide) return;
    active = Math.min(SLIDES.length - 1, Math.max(0, Math.round(scroller.scrollLeft / (slide.offsetWidth + 12))));
  }

  function show(i: number) {
    const slide = scroller?.children[i] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
</script>

<div class="space-y-3">
  <div bind:this={scroller} onscroll={onScroll} class="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-5 px-5" role="group" aria-label="Screens of the app">
    {#each SLIDES as slide, i}
      <figure class="snap-center shrink-0 w-[64%] max-w-[240px] space-y-2" aria-label="{i + 1} of {SLIDES.length}">
        <div class="h-[250px] overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <img src={slide.src} alt="{slide.title} screen" class="w-full object-cover object-top" loading={i === 0 ? 'eager' : 'lazy'} draggable="false" />
        </div>
        <figcaption>
          <p class="text-label text-content">{slide.title}</p>
          <p class="text-caption text-content-subtle leading-snug">{slide.text}</p>
        </figcaption>
      </figure>
    {/each}
  </div>
  <div class="flex justify-center gap-1.5">
    {#each SLIDES as slide, i}
      <button onclick={() => show(i)} class="w-1.5 h-1.5 rounded-full transition-colors {i === active ? 'bg-primary' : 'bg-surface-elevated-hover'}" aria-label="Show the {slide.title} screen" aria-current={i === active}></button>
    {/each}
  </div>
</div>
