/**
 * Two small typing helpers, installed once for the whole app rather than
 * wired into every form:
 *
 *  - Focusing a number field selects what's in it, so typing replaces
 *    "60" instead of producing "6045".
 *  - Enter moves to the next field (the keyboard's key says "Next"), and
 *    on the last one closes the keyboard ("Done") - it used to do nothing.
 *    Inside a `<form>` Enter keeps submitting it, and a field with an
 *    Enter action of its own opts out with `data-own-enter`. Search
 *    fields are left alone.
 *
 * "Next" stays within the field's own sheet, overlay or card, so it never
 * jumps into an unrelated part of the screen.
 */

const TEXT_TYPES = new Set(["text", "number", "email", "tel", "url", "password", ""]);

function isNumberField(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  return el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric";
}

function handlesEnter(el: Element): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    TEXT_TYPES.has(el.type) &&
    !el.closest("form") &&
    !el.hasAttribute("data-own-enter")
  );
}

/** The sheet, overlay or card a field belongs to - "Next" stays inside it. */
function scopeOf(el: Element): ParentNode {
  return el.closest("[data-enter-scope], [role='dialog'], .fixed, .card") ?? document;
}

function isFillable(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (el instanceof HTMLInputElement) {
    if (!TEXT_TYPES.has(el.type) && el.type !== "search") return false;
  } else if (!(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
    return false;
  }
  const f = el as HTMLInputElement;
  return !f.disabled && !f.readOnly && (f as HTMLElement).offsetParent !== null;
}

export function nextField(el: Element): HTMLElement | null {
  const fields = [...scopeOf(el).querySelectorAll("input, textarea, select")].filter(isFillable);
  const i = fields.indexOf(el as HTMLInputElement);
  return i >= 0 && i < fields.length - 1 ? (fields[i + 1] as HTMLElement) : null;
}

let installed = false;

export function installFormHelpers() {
  if (typeof document === "undefined" || installed) return;
  installed = true;

  document.addEventListener("focusin", (e) => {
    const el = e.target as Element;
    if (isNumberField(el)) {
      // After the browser has placed the caret, or it undoes the selection.
      setTimeout(() => {
        try {
          if (document.activeElement === el) el.select();
        } catch {
          // Some input types refuse select(); nothing to do.
        }
      }, 0);
    }
    // Set on every focus (fields come and go), unless the markup chose its own.
    if (handlesEnter(el) && (!el.hasAttribute("enterkeyhint") || el.hasAttribute("data-auto-enterkeyhint"))) {
      el.enterKeyHint = nextField(el) ? "next" : "done";
      el.setAttribute("data-auto-enterkeyhint", "");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return;
    const el = e.target as Element;
    if (!handlesEnter(el)) return;
    e.preventDefault();
    const next = nextField(el);
    if (next) next.focus();
    else (el as HTMLInputElement).blur();
  });
}
