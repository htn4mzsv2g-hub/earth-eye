# Operator UX-3

**Fly:** v32 `registry.fly.io/eartheye:deployment-01M3P5KH7X4GBYAY4AMF4W5CT6` (commit `48333e8`)  
**Physical iPhone gate:** INCOMPLETE  
**Auth:** untouched (AUTH stream owns login/session-auth)

## Shipped
1. Camera open / close / not-in-catalog status toasts (`onStatus` → command bar say)
2. Analyst AI-off strip dismissible (persisted `ee-ai-strip-dismissed`)
3. Contextual quake / fire / alert / road actions on selection card via `gev:entity-selected` (FLY TO / DETAILS)
4. Sheet handle gestures: drag up expands, drag down peeks then closes; tap cycles PEEK/HALF/FULL
5. VOICE dead-button → honest needs-key toast when OpenAI unset; CAM LAYER title clarified
6. No auth/login edits; no push; no paid OpenAI; AO-0 hard-off; Broadcastify HELD; Option C
7. Tests: ux3 + selectionCard + mobileLayout green
8. Deployed Fly v32
