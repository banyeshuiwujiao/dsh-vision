---
name: visual-memory
description: >-
  Visual working memory for text-only agents: when the user provides an
  image, map it into a numbered element inventory, reason by element id,
  zoom into regions for precise reading, and extract text verbatim. Use for
  any task where the user shares an image or a file path — UI understanding,
  image Q&A, transcription of long pages.
---

# visual-memory

You are a text-only agent: you cannot see images yourself. When the user
shares an image (an attachment or a file path in the message), these tools
turn it into what you can actually reason about — numbered element lists
and precise text answers. Every visual fact you act on must come from a
tool result.

## The loop

image arrives → map → pick ids → zoom → answer.

The user gives you an image; you give back understanding. For anything
multi-step, work outside-in: one full-image pass first, then zoom into the
parts that matter.

## Map first

For any "what is in this image" or "where is X" question, call `vision_map`
BEFORE reasoning. It returns a numbered inventory in reading order and
keeps it in visual working memory. Refer to elements by id ("element 7"),
never by vague description. `focus` narrows the inventory to one kind
("buttons"); dense pages benefit from region-scoped map calls per section.

## Registry lifetime

Ids belong to the file the map came from. A different file is a different
image and a new map — re-map for every image you reason about. Ids never
carry over between files, and a modified file invalidates its map.

## Zoom is how you read

Full-image passes miss small text, icons, and states. Before asserting what
an element says or shows, inspect it with `vision_zoom ref "7"` — the crop
is uploaded alone, at full resolution. The crop box must come from
something you actually have (a ref id or a printed box), not an imagined
location.

## The sufficiency rule

You cannot see the image yourself. If a description you received lacks a
detail, request a targeted inspection instead of completing the gap. If the
vision model reports something as not legible at this scale, zoom and
re-ask. If a vision call errors, relay the error faithfully — never invent
image content to keep the task moving.

## Never fabricate visual details

Colors, states, styling, or text that no tool call confirmed do not exist
in your answer. A vision model's prose is evidence about what it saw, not a
guarantee of pixel-level facts; treat exact values with the same care.

## Read by mode

- `mode: "transcribe"` — verbatim text extraction. Tall pages are tiled into
  overlapping strips and merged automatically: trust the merged transcript,
  do not re-slice yourself. Lines cut at strip boundaries are marked with
  `[...]` — that is cut-off text, not missing content.
- `mode: "ask"` — a precise question. State exactly what this step needs,
  not a generic "describe the image".

## Compare in one call

Multi-image comparison passes all paths to ONE `vision_read` ask call.
Separate calls cannot see each other, so two answers compared afterwards are
two guessing surfaces, not a comparison.

## Boxes are handles, not answers

A box from `vision_map` is accurate enough to crop and zoom. It is not a
guarantee of pixel-exactness — the model works on a scaled grid.

## Tool table

| Question | Tool |
|---|---|
| What elements exist in this image, and where? | `vision_map` |
| What does one element say / show? | `vision_zoom` |
| What does the whole image say / what text is in it? | `vision_read` |

## Task patterns

- **UI walkthrough**: map → zoom the parts that matter.
- **Find and inspect**: map → pick the id → zoom → read its text or state.
- **Transcription**: `vision_read` transcribe on the file; long pages merge
  automatically.
- **Comparison**: `vision_read` ask with all paths in one call.

Design references: see REFERENCES.md in the plugin package.
