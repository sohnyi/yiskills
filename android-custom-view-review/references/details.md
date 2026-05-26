# Android Custom View — Code Examples

## onDraw: object allocation (memory jitter)

```kotlin
// Bad — Paint + RectF + String allocated every frame
override fun onDraw(canvas: Canvas) {
    val paint = Paint().apply { color = Color.BLUE; strokeWidth = 4f }
    val rect = RectF(paddingLeft.toFloat(), paddingTop.toFloat(),
                     (width - paddingRight).toFloat(), (height - paddingBottom).toFloat())
    canvas.drawText("Score: $score", cx, cy, paint)
}

// Good — zero allocation per frame
private val paint = Paint().apply { color = Color.BLUE; strokeWidth = 4f }
private val rect = RectF()
private var labelCache = ""

override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    rect.set(paddingLeft.toFloat(), paddingTop.toFloat(),
             (w - paddingRight).toFloat(), (h - paddingBottom).toFloat())
}
// Update labelCache in the property setter, not in onDraw
```

## onMeasure: wrap_content + padding

```kotlin
override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val desiredW = contentWidth + paddingLeft + paddingRight
    val desiredH = contentHeight + paddingTop + paddingBottom
    setMeasuredDimension(resolveSize(desiredW, widthMeasureSpec),
                         resolveSize(desiredH, heightMeasureSpec))
}
// resolveSize: EXACTLY→spec size, AT_MOST→min(desired,spec), UNSPECIFIED→desired

override fun onDraw(canvas: Canvas) {
    val l = paddingLeft.toFloat()
    val t = paddingTop.toFloat()
    val r = (width - paddingRight).toFloat()
    val b = (height - paddingBottom).toFloat()
    canvas.drawRect(l, t, r, b, paint)
}
```

## Constructor pattern

```kotlin
class MyView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {
    init {
        val a = context.obtainStyledAttributes(attrs, R.styleable.MyView, defStyleAttr, 0)
        try {
            myColor = a.getColor(R.styleable.MyView_myColor, Color.BLACK)
        } finally {
            a.recycle()
        }
    }
}
```

## Thread / Animation lifecycle

```kotlin
private var animator: ValueAnimator? = null

override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1000; repeatCount = ValueAnimator.INFINITE
        addUpdateListener { invalidate() }
        start()
    }
}

override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    animator?.cancel()
    animator = null
}
```

## Scroll conflict — child approach

```kotlin
override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
            lastX = event.x; lastY = event.y
            parent.requestDisallowInterceptTouchEvent(true)
        }
        MotionEvent.ACTION_MOVE -> {
            val dx = abs(event.x - lastX); val dy = abs(event.y - lastY)
            parent.requestDisallowInterceptTouchEvent(dx > dy) // true = child owns horizontal
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
            parent.requestDisallowInterceptTouchEvent(false)
    }
    return super.onTouchEvent(event)
}
```

## Scroll conflict — parent approach

```kotlin
override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> { lastX = ev.x; lastY = ev.y; return false } // never intercept DOWN
        MotionEvent.ACTION_MOVE -> {
            if (abs(ev.y - lastY) > abs(ev.x - lastX) &&
                abs(ev.y - lastY) > ViewConfiguration.get(context).scaledTouchSlop)
                return true
        }
    }
    return false
}
```

## State save / restore

```kotlin
override fun onSaveInstanceState(): Parcelable {
    val superState = super.onSaveInstanceState()
    return SavedState(superState).also { it.myValue = currentValue }
}

override fun onRestoreInstanceState(state: Parcelable?) {
    (state as? SavedState)?.let { super.onRestoreInstanceState(it.superState); currentValue = it.myValue }
        ?: super.onRestoreInstanceState(state)
}
```

## Accessibility

```kotlin
override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) performClick()
    return true
}
override fun performClick(): Boolean { super.performClick(); /* custom logic */; return true }
```
