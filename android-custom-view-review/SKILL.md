---
name: android-custom-view-review
description: Review Android custom View and ViewGroup code for correctness, performance, and platform best practices. Use when the user shares custom View code and asks for a review, audit, or optimization — or mentions onDraw, onMeasure, onLayout, Canvas, Paint, invalidate, requestLayout, wrap_content, padding, scroll conflict, or custom view performance.
when_to_use: Trigger when user asks "review my custom view", "is this view correct?", "why is my view slow?", "does this support wrap_content?", "how do I handle scroll conflict?", or pastes a class that extends View, ViewGroup, or any subclass with overridden drawing/layout methods.
---

# Android Custom View Review

Review for bugs and performance pitfalls unique to the Android rendering pipeline.
For detailed code examples of any item, read `references/details.md`.

## Workflow

1. Identify the base class and which lifecycle methods are overridden.
2. Run through every checklist item below.
3. Output a report using the format at the end of this file.
4. Severity: 🔴 Critical · 🟡 Warning · 🔵 Suggestion

---

## Checklist

### onDraw / dispatchDraw
- 🔴 Any object allocated inside `onDraw`: `Paint`, `Path`, `Rect`, `RectF`, `Matrix`, strings, lambdas, collections — causes memory jitter (GC bursts → frame drops). Declare as fields, init once.
- 🔴 `invalidate()` called inside `onDraw` — infinite draw loop, pegs CPU/GPU. Use `ValueAnimator` for animation.
- 🟡 `invalidate()` called off main thread without `postInvalidate()`.
- 🟡 `canvas.save()` / `canvas.restore()` unbalanced — corrupts rendering.
- 🟡 `setWillNotDraw(false)` missing on ViewGroup that overrides `onDraw`.
- 🔵 No dirty-rect in `invalidate()` — full redraw when partial suffices.
- 🔵 Size-dependent values not pre-computed in `onSizeChanged()`.

### onMeasure — wrap_content & padding
- 🔴 `setMeasuredDimension()` not called — runtime exception.
- 🔴 `MeasureSpec` ignored — `wrap_content` behaves like `match_parent`. Use `resolveSize(desired, spec)`.
- 🔴 Padding not added to desired size in `onMeasure` (`paddingLeft + paddingRight`, etc.).
- 🔴 Padding not applied as drawing offset in `onDraw` — `android:padding` has no visual effect.
- 🟡 ViewGroup calls `child.measure()` directly instead of `measureChildWithMargins()`.

### onLayout
- 🔴 ViewGroup skips `child.layout()` for any child — child won't be drawn.
- 🟡 `requestLayout()` called inside `onLayout` or `onMeasure` — re-entrant loop / ANR.
- 🟡 `requestLayout()` called off main thread (throws API 26+) — use `post { requestLayout() }`.

### Handler
- 🟡 `Handler` created in View without cancellation in `onDetachedFromWindow()` — Context leak. Prefer `View.postDelayed` or Coroutine.
- 🟡 `handler.removeCallbacksAndMessages(null)` missing in `onDetachedFromWindow()`.

### Thread & Animation Lifecycle
- 🔴 `ValueAnimator` / `ObjectAnimator` / Thread / Coroutine not stopped in `onDetachedFromWindow()` — memory leak, crash, battery drain.
- 🟡 Animator `.pause()`'d but not `.cancel()`'d — still holds references.
- 🟡 `postDelayed` runnable not removed via `removeCallbacks()` on detach.
- Start resources in `onAttachedToWindow()`, stop in `onDetachedFromWindow()`.

### Scroll Conflict
- 🔴 Nested scrollable views with no conflict resolution — one scroll axis unresponsive.
- 🔴 Parent intercepts `ACTION_DOWN` — breaks all child touch handling.
- 🟡 `ACTION_CANCEL` not handled in child — state not reset when parent steals gesture.
- Child approach: call `parent.requestDisallowInterceptTouchEvent(true/false)` based on gesture direction.
- Parent approach: override `onInterceptTouchEvent()`, never intercept `ACTION_DOWN`.
- Use `ViewConfiguration.scaledTouchSlop` before deciding gesture ownership.

### State Save / Restore
- 🔴 Interactive state (scroll pos, selection) not saved — lost on rotation. Use `BaseSavedState`.
- 🟡 View has no `android:id` — system silently skips save/restore.

### Constructor & Attributes
- 🔴 `TypedArray` not `recycle()`'d — memory leak.
- 🟡 Missing `@JvmOverloads` / XML constructors — `InflateException` when inflated from XML.

### Accessibility
- 🟡 `performClick()` doesn't call `super` — suppresses `AccessibilityEvent`.
- 🔵 No `contentDescription` on interactive view.

### General Performance
- 🟡 `LAYER_TYPE_SOFTWARE` set unnecessarily — disables GPU acceleration for subtree.
- 🔵 Bitmap not recycled in `onDetachedFromWindow()`.
- 🔵 Listener registered in `onAttachedToWindow()` not unregistered in `onDetachedFromWindow()`.
- 🔵 No `isInEditMode()` guard on preview-only code.

---

## Report Format

```
## Android Custom View Review: [ClassName]

### Summary
[One sentence: what it does + overall quality signal]

### Issues
🔴 [issue] — [location] — [fix]
🟡 [issue] — [location] — [fix]
🔵 [issue] — [location] — [benefit]

### What's Done Well
- [positives]

### Next Steps
[Ordered priority list]
```

Omit severity tiers with no findings.