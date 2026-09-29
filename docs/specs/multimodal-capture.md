# Multimodal capture

Status: agreed from `docs/spec.md` and the original planning session, 2026-09-29.

## Problem Statement

The app remembers typed notes only. A user cannot save a spoken thought, photo, PDF, article, or video link and retrieve its contents later.

## Solution

Add capture for microphone recordings, audio files, images, PDFs, web pages, YouTube links, and Instagram links. Save the original input before extraction. Show processing, quality, and failure clearly. Extracted text enters the existing enrichment and search pipeline, so questions cite the saved item. Keep the current single-theme UI and Phosphor icons.

## User Stories

1. As a user, I can record a voice note in my browser, so I can save a thought without typing.
2. As a user, I can upload an audio file, so I can remember an existing recording.
3. As a user, I can play my saved audio and read its transcript, so I can verify what was captured.
4. As a user, I can upload or take a photo, so I can save a screenshot or physical page.
5. As a user, I can view the original photo and its extracted words and description, so I can check the result.
6. As a user, I can upload a PDF, so its contents become searchable while the original stays available.
7. As a user, I can paste a web URL, so the article text and source are saved together.
8. As a user, I can paste a YouTube URL, so its title and available transcript become searchable.
9. As a user, I can paste an Instagram URL, so its available caption or transcript becomes searchable.
10. As a user, I can add a note with a link, so partial captures still preserve my context.
11. As a user, I see when content is processing, partial, or failed, so I know what the app can recall.
12. As a user, I can retry a failed extraction, so temporary provider failures do not lose my input.
13. As a user, I can open a cited source from an answer, so I can inspect the original file or URL.
14. As a user, I can add optional transcript and reader API keys, so blocked videos or articles can be retried.
15. As a user, I can delete a capture and its private file, so I control the original content.
16. As a user, I get clear validation for unsupported formats and oversized files, so I can correct the input.
17. As a user, I can use capture and inspect results at phone width, so the feature works away from my desk.

## Implementation Decisions

- Keep the existing Queue → Workflow → enrich → index path. Add an extraction stage before enrichment. Persist extracted raw text and capture quality before model enrichment so retries are safe.
- Add source URL, private file key, MIME type, original name, size, and quality to items. Raw input exists before enqueue. Repeated URLs dedupe per user; file bytes dedupe by hash per user and add a new capture timestamp.
- Store uploads in private R2. Authenticated, owner-scoped routes stream originals for previews and downloads. Validate MIME, bytes, and file signatures at the API boundary. Use bounded uploads: 25 MB audio/PDF, 10 MB image. Never expose R2 keys.
- Browser recording uses native MediaRecorder, with a visible stop action and permission/error state. Upload accepts supported audio MIME types, JPEG, PNG, WebP, and PDF. Mobile camera uses native file input capture.
- Audio uses OpenRouter transcription on the user's existing key. Image uses OpenRouter vision to return literal visible text plus a brief scene description. PDF text conversion uses Cloudflare AI Markdown; scanned pages use OpenRouter PDF OCR on the user's key. Keep original files.
- Article extraction starts with Markdown response, then parsed HTML. Browser Run and an optional reader key are fallbacks. Paywall or login wall yields partial title/description/user note instead of invented article text. A URL that cannot be fetched at all is retained as failed and retryable.
- YouTube uses official metadata when the operator's Google API key is configured, then opportunistic captions, then the user's optional Supadata transcript key. Without available content, save URL and note as partial. Instagram uses the optional Supadata key; without it, save URL and note as partial. Never scrape private content or promise every transcript.
- Optional keys use the existing encrypted user-key store. OpenRouter remains required for enrichment. Sending user content to third parties is disclosed in settings.
- The new capture controls fit the existing home composition. Item pages show original source, extracted text, quality, error, and retry. Source cards link to the item; the item links to its original source.
- Each input type is a separate vertical ticket. Audio establishes the common file storage seam; image and PDF reuse it. URLs are independently deliverable.

## Testing Decisions

- Test observable API and browser behaviour, not internal helpers. Follow existing API integration tests and Playwright fixtures.
- Each ticket starts with a failing API capture/process/retrieve test and a focused browser flow. Stub external model/extraction providers; no paid calls in CI.
- Cover wrong owner, invalid type, size, format, unavailable microphone, provider failure, retry, duplicate capture, delete, and partial content where relevant.
- Verify each finished flow in the running app at desktop and phone widths before review and PR.

## Out of Scope

- Direct video-file upload, browser extension, auto capture, calendar/email sync, and a new UI theme. The original V1 plan calls for video **links**, not uploaded video files.
- Transcribing private or inaccessible social content without user authorization.

## Further Notes

- `docs/spec.md` is the product-level contract. This spec covers the remaining input formats; slice 1 text capture and ask remain intact.
- API and platform facts checked in `docs/research/13-multimodal-capture-apis.md`.
