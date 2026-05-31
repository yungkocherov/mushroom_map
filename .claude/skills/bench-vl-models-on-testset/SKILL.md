---
name: bench-vl-models-on-testset
description: Use when benchmarking an image model (a VL chat model loaded in LM Studio, or a specialized classifier like DF20/FungiTastic via timm) against the 306-photo ground-truth mushroom testset for the Geobiom VK-photo pipeline. Covers the per-model output-mode trap (strict json_schema collapses some VL models to [], its absence makes reasoning models ramble to []), pre-flight discipline, model-crash/thinking/timeout diagnosis, the timm DF20 adapter, and the eyeball report. Avoids re-discovering each model's working mode from scratch.
---

# Benchmark a model on the 306-photo mushroom testset

Run any image model over the honest ground-truth testset and place its
answer beside the human label in an eyeball HTML report. **No programmatic
scoring** — the user reviews visually (explicit preference). Harness lives in
`C:\tmp` next to the testset (scratch, not git). venv:
`/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe`.

## What's where (C:\tmp)
- `testset_groundtruth.jsonl` — 306 photos; per-photo `truth.observed_species`
  (free-form Latin) + `scene` + `no_mushroom`. Photos: `testset_photos/<id>.jpg`.
- `bench_run.py` — LM-Studio VL runner. Flags: `--name`, `--mode {prompt,schema}`,
  `--limit N`, `--workers`, `--timeout`, `--dry-run`. Resumable (errored photos
  stay retryable). Emits `BENCH_RUN_DONE ok= fail=`.
- `bench_run_df20.py` — specialized timm classifier (BVRA DF20 ViT) runner.
- `bench_report.py <run.jsonl> [...]` — N-column eyeball report → `bench_report.html`
  (open from C:\tmp so photos resolve). Each card: photo, my truth, each model's chips.
- `bench_analyze.py <run.jsonl>` — descriptive tally (NOT scoring): records, empty[],
  species freq, no_mushroom agreement, sarcoscypha recall.
- v14 prompt (in repo): `pipelines/prompts/vk_classify_v14.{txt,json}` — v13 + the
  `sarcoscypha` slot. Benchmark-only; prod `ingest_vk.PHOTO_PROMPT_VERSION` untouched
  (changing it = full re-classification of every VK photo).

## THE CORE TRAP: output mode is per-model — pre-flight to pick it
Same v14 task in LM Studio, but each model works in exactly ONE mode:
- `--mode prompt` (JSON format spelled out in prompt text, NO response_format):
  works for no-think VL like **qwen3-vl-8b**. Strict json_schema COLLAPSES this
  model to `[]` (LM Studio constrained-grammar railroads it to empty array — even
  `strict:false` still applies grammar).
- `--mode schema` (strict json_schema response_format): needed for models that
  THINK when unconstrained (**qwen3.5-9b, gemma-4-e4b**). Without the grammar they
  ramble in `content` ("Here's a thinking process…"), hit `max_tokens`
  (`finish:length`), and return `[]`. The schema forces immediate JSON.
- `/no_think` + `chat_template_kwargs.enable_thinking=False` are IGNORED by some
  templates (qwen3.5/3.6, gemma). Do NOT trust them.

ALWAYS pre-flight `--limit 3` in a mode, inspect, switch mode if `[]`. Record the
mode per run; note in the report that models ran in different modes (same v14
taxonomy — fair on identification, the abstention/empty metric is mode-confounded).

## Failure modes (diagnose with a probe, don't thrash)
- All `[]`, fast, finish=stop → strict-schema collapse (VL). Switch to `--mode prompt`.
- All `[]`, `finish:length`, `raw_head` = "thinking process…" → reasoning model
  truncating. Switch to `--mode schema`.
- HTTP 400 "The model has crashed" (exit ~0xC000…) → model is TEXT-ONLY and got an
  image (e.g. **qwen3.6-27b** — no `vl` in name). Prove: free-form "describe this
  image" + GET `/v1/models`. Text-only can't classify photos → skip it.
- Read timeout → model too slow: raise `--timeout`, drop `--workers 1`.
- Identical `prompt_tokens` across different images is NOT proof vision is off
  (Qwen pads images to a fixed token grid). Prove vision with a free-form describe call.

## Run loop (long → background + monitor + wakeup; see run-bg-pipeline)
```bash
cd /c/tmp
PY=/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe
# 1. user loads model in LM Studio (localhost:1234), Parallel>=5
# 2. pre-flight 3 photos, pick mode (try prompt, then schema if [])
$PY bench_run.py "<model-id>" --name <label> --mode prompt --limit 3
# 3. full run, background (-u for live log) + until-grep monitor on BENCH_RUN_DONE
$PY -u bench_run.py "<model-id>" --name <label> --mode <picked> > bench_<label>.log 2>&1   # run_in_background
# monitor: until grep -qE "BENCH_RUN_DONE|Traceback" bench_<label>.log; do sleep 30; done
# 4. report + tally (progress visible via wc -l bench_runs/<label>.jsonl)
$PY bench_report.py bench_runs/*.jsonl
PYTHONIOENCODING=utf-8 $PY bench_analyze.py bench_runs/<label>.jsonl
```

## Specialized classifier (DF20 / FungiTastic, via timm)
- `timm.create_model("hf-hub:BVRA/vit_base_patch16_224.ft_df20_224")` (CC-BY-NC,
  ~86M, CPU fine, fast). torch HAS cp314 wheels → Python 3.14 venv is fine.
- Class ordering = **sorted unique `scientificName`** from `DF20-metadata.zip`
  (`num_classes == unique scientificName count`, here 1604). VALIDATE on a known
  photo (porcini basket → `Boletus edulis` ~1.0) before trusting.
- DF20-**Mini** (182) is too narrow — MISSES Leccinum/Cantharellus/Lactarius/
  Morchella/Armillaria/Pleurotus/Sarcoscypha (it's the 182 most-photographed Danish
  species, not the Russian forage basket). Use **FULL DF20 (1604)**.
- Map predicted species → our 18 keys (invert `GROUP_TO_SLUGS` + genus rules; rest →
  `other`). Single-label + trained on single specimens → **OOD on baskets/kitchen**
  (top-1 lands off-target ~58% on VK photos). Strong on clean single forest shots.

## Result (2026-05-31, 4 models)
Prod **qwen3.5-9b still best** for VK baskets. vl-8b cautious but weak (spray,
misses). gemma-4-e4b = "porcini detector" (porcini on 71% of mushroom photos).
DF20 specialized: fine-grained signal (caught a Sarcoscypha both VLs missed) but
OOD on baskets — a future single-mushroom-ID feature, not a basket-pipeline swap.
v14 `sarcoscypha` slot validated across all (9b 88% recall). Full state:
`memory/project_vl_classifier_benchmark_2026_05.md`.
