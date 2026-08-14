# Design references

This plugin is an independent, original TypeScript implementation. The
papers and projects below shaped its DESIGN DECISIONS (tool semantics,
prompt strategies, coordinate conventions, tiling and verification
patterns). No code was copied from any of them.

## Papers

| Title (first author, year) | arXiv | Design relevance |
|---|---|---|
| Set-of-Mark Prompting (Yang et al., 2023) | 2310.11441 | Numbered visual marks; text-only agents reference regions by id — the vision_map registry backbone |
| OmniParser: Screen Parsing (Lu et al., 2024) | 2408.00203 | Numbered overlay plus a text element list; a text-only model picks ids — the practical precedent for vision_map |
| Visual Programming (Gupta & Kembhavi, 2023) | 2211.11559 | Modular visual operators composed per task |
| Visual ChatGPT (Wu et al., 2023) | 2303.04671 | A prompt manager routing tasks to different visual models — the per-task model routing config |
| LLaVA-Plus (Liu et al., 2024) | 2311.05437 | Skill-library composition and coarse-to-fine workflows |
| Woodpecker (Yin et al., 2023) | 2310.16045 | Verifying claims against visual evidence — the vision_check design (v1.1) |
| V* / SEAL (Wu & Xie, 2023) | 2312.14135 | Guided coarse-to-fine search and the sufficiency rule — the zoom loop and "never fabricate" instruction |
| CogAgent (Hong et al., 2023) | 2312.08914 | High-resolution GUI understanding for agents |
| SeeClick (Cheng et al., 2024) | 2401.10935 | GUI grounding; the ScreenSpot benchmark |
| UGround (Gou et al., 2024) | 2410.05243 | Grounding via element labels rather than raw coordinates |
| OS-Atlas (Wu et al., 2024) | 2410.23218 | 0-1000 normalized coordinates — the plugin's internal convention |
| Qwen-VL (Bai et al., 2023) | 2308.12966 | Vision-language model input/output coordinate protocols |
| Molmo (Deitke et al., 2024) | 2409.17146 | Visually grounded pointing in open VLMs |
| GRiT (Wu et al., 2022) | 2212.00280 | Dense captioning with localization — element inventories |
| GroundingDINO (Liu et al., 2023) | 2303.05499 | Open-set named-target location |
| Monkey (Li et al., 2023) | 2311.06607 | Patch-based high-resolution inputs |
| LLaVA-UHD (Xu et al., 2023) | 2311.17757 | Slice-based high-resolution perception — the strip tiling design |
| InternLM-XComposer2 (Dong et al., 2024) | 2401.16420 | High-resolution and multi-image composition — compare-in-one-call |

## Engineering practices (from public documentation and community reports)

- Structured JSON output requires the word "json" in the prompt; validate
  the response regardless of `response_format`; never send `max_tokens`
  alongside structured output (truncation mid-JSON is worse than none).
- Temperature 0 for grounding and transcription work.
- Ask for a 0-1000 grid (resolution-agnostic); clamp, deduplicate, and sort
  boxes in reading order after parsing.
- Downscale uploads to a long-edge budget; crop regions before upload
  instead of uploading whole pages; never generative super-resolution
  (it invents strokes and worsens reading).
- Deterministic pixel operations (crops, diffs) beat vision calls for exact
  values; a full-image pass routinely misses small text and icons.

## Prior art reviewed for differentiation

The plugin was deliberately designed to differ from existing "vision for
text-only agents" toolkits (CLI-and-skill glue suites, message-routing
proxies, and single-model DSH tool bundles): it is a DSH-native service with
a numbered region registry (visual working memory) as the primary
interface, one internal coordinate convention with a model-adapter seam,
per-task model routing, deterministic strip tiling for long pages, and zero
runtime dependencies (no Python runtime, no external detection models).
