# Thread composer UX

## Problem

Long conversations open at the first message. The reply field sits after every message, so a user must scroll through the thread before reading the latest answer or asking a follow-up.

## Behavior

- Opening a thread shows its latest answer above a reply field anchored to the viewport bottom.
- The reply field remains visible while reading older messages. On phones it sits above the main navigation and safe area.
- Sending a follow-up shows the pending state and then the new reply without manual scrolling. Errors appear next to the reply field.
- Conversation deletion remains reachable after the messages.
- API, stored data and the single theme stay unchanged.

## Verification

- Browser test with a long thread on desktop and phone: latest answer and reply field start in view, reply field stays in view after scrolling to the top, and a sent follow-up returns to the new answer.
- Run repository checks and production web build. Inspect desktop and phone layouts in the browser.
