# Operator UX-5

**Fly:** v37 `registry.fly.io/eartheye:deployment-01M3P6GYJ5X5QEQR8GC3G0A4PN` (commit `2111aac`); tip after AUTH-8 race is **v38** (includes UX-5)  
**Physical iPhone gate:** INCOMPLETE  
**Auth:** untouched by this stream (AUTH-8 landed separately as v38)

## Why this slice (not IDLE)
Directive leftovers solid without a device pass:
- Safe-area CSS existed but was ineffective in standalone PWA without `viewport-fit=cover`
- Contextual DETAILS missing for road/other (installations)
- Clear / cockpit-exit / camera-fail stayed silent

**Skipped (would invent):** Dynamic Type rem rebuild, ROUTE buttons on traffic (no pick), further chrome cosmetics.

## Shipped
1. `viewport-fit=cover` + apple web-app capable / black-translucent status bar
2. `-webkit-text-size-adjust: 100%` on compact chrome
3. Selection card left/right safe-area insets
4. Road + other: FLY TO + DETAILS; road honesty hint
5. Feedback: Selection cleared / Cockpit exited / Camera unavailable
6. No push / no paid OpenAI / Option C / Broadcastify HELD
7. Tests ux5 (+ux3/ux4/selectionCard) green
8. Deployed (v37); live tip v38 still carries UX-5

## Next
**IDLE** on Operator UX until owner iPhone gate pass — no further high-value directive gaps without device evidence.
