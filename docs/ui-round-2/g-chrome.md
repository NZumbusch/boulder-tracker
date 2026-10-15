# Package G: chrome, common widgets, navigation, tokens, onboarding, tour

## Shared additions (other packages may use these now)

| Name | What it is for |
| --- | --- |
| `text-content-faint` (token `--color-content-faint`) | The quietest text that still passes 4.5:1 on a plain surface or the page background. Use it instead of `text-content-subtle/60` or `/70`. Not for text on tinted panels. Tested in `src/lib/ui/tokens.test.ts`. |
| `text-micro` (`--typescale-micro`) | 11 px text that follows the Text size setting, for chart axes, badges and small labels. Replaces `text-[9px]` and `text-[10px]`. |
| `src/lib/ui/typeFloor.test.ts` | Lists the files that still use `text-[9px]`/`text-[10px]` as an allowlist. When you convert a file, delete its line from `ALLOWED` (the test fails if an allowed file is already clean). |
| `.tile` | A tight stat tile (`p-3`) that flattens with the "flat sections" setting like `.card` (transparent, hairline border). For summary strips and metric grids. |
| `.pressable` | A pressed state for rows/buttons on touch (`active:bg-surface-elevated/50`). |
