# Hugging Face model fit for O2C

## Decision

No Hugging Face model is integrated or called by this change. No Hugging Face adapter, inference endpoint, token, or document-OCR upload path exists in the repository. The existing CSV/XLSX import flow remains unchanged. Model-card review is not evidence of a configured or production connection, and no model inference was run for this assessment.

**OCRia-nano-1 is the closest future fit** for pre-import invoice/remittance document parsing, but it is not cleared for production use. Its custom license may restrict commercial use and prohibits some competing document-extraction services; the organization’s revenue/funding status and whether this product falls within that definition are unknown. Legal review or a commercial license is required before a pilot. If clearance is unavailable, do not use it.

## Candidate decisions

| Model | O2C fit | Decision |
|---|---|---|
| [OCRia-nano-1](https://huggingface.co/llamaindex/OCRia-nano-1) | Local PDF/image OCR, layout, and tables could propose candidate invoice/remittance fields with page, box, and confidence provenance. The card does not establish AR-specific accuracy. | Future opt-in, read-only candidate extraction only after legal clearance, representative evaluation, and a secure document-ingestion design. |
| [Inkling-2-Mini](https://huggingface.co/thinkingmachines/Inkling-2-Mini) | Multimodal text/image assistant might interpret evidence, but the card documents hallucination and reliability limits; it is large and has no AR benchmark. | Not integrated. Reconsider only after a redacted AR-specific evaluation and privacy/cost review. |
| [Ternary-Bonsai-2.5-27B-GGUF](https://huggingface.co/prism-ml/Ternary-Bonsai-2.5-27B-GGUF) | Text/tool-use model, not a deterministic accounting or extraction engine; specialized runtime and hardware add operational burden. | Not integrated; no new model runtime or tool surface added. |
| [Voice Isolator](https://huggingface.co/inworld/voice-isolator) | Audio denoising, not speech recognition, OCR, remittance extraction, or reconciliation; isolation may change evidence. | Excluded from the current AR workflow; no audio-evidence feature added. |
| [LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) | Generative audiovisual model, unrelated to ledger evidence and import controls; gated access and license review add risk. | Excluded; no video/audio generation feature added. |

The model cards are capability descriptions, not proof of AR accuracy, tenant isolation, privacy guarantees, provider terms, or production readiness. Check each linked card and its controlling license again before any future use.

## Safe future OCR boundary (not implemented)

If OCRia is later legally and operationally approved, use it only behind an authenticated, server-side, entity-bound adapter:

```text
Signed-in user + selected tenant/entity
  → bounded, authorized source-document intake (new feature; not current CSV/XLSX import)
  → preserve original bytes and record digest, actor, scope, and retention policy
  → optional OCR/layout extraction with pinned model and runtime version
  → candidate text/fields + page/box provenance + confidence/abstention
  → deterministic schema, identity, date, currency, and exact-decimal validation
  → human review against the immutable original
  → existing governed import/maker-checker process; never direct model posting
```

The model output is untrusted evidence. It must never calculate/post balances, commit an import, approve or allocate cash, determine user authority, bypass tenant/entity RLS, or create an audit conclusion. Keep financial records and model credentials out of browser storage. Any external inference would require a separately approved privacy, data-residency, retention, and provider review; do not send customer evidence to an unapproved hosted endpoint. Local inference still needs workload limits, access controls, immutable provenance, audit records, and deletion/retention controls. A pilot must use synthetic, redacted, or explicitly consented data and measure field/table/layout error rates, currency/decimal edge cases, multilingual scans, prompt/document injection, latency, capacity, and cost before release.

## Required gates before adding any model

1. Confirm the model’s current controlling license and obtain legal approval; specifically resolve OCRia’s revenue/funding and competing-service clauses or obtain the necessary commercial license.
2. Implement and security-review document intake and storage; the current app does not accept or archive arbitrary invoice/remittance PDFs or images.
3. Evaluate on representative but synthetic, redacted, or consented documents. Define abstention and rejection thresholds; never infer correctness from confidence alone.
4. Preserve tenant/entity scope, exact decimal strings, deterministic validation, source provenance, auditability, independent maker/checker, and separate posting.
5. Make model use explicitly configured, budgeted, observable, and disableable. Do not perform paid inference or transmit customer evidence without a separately approved provider and privacy design.

## Sources

- [OCRia-nano-1 model card](https://huggingface.co/llamaindex/OCRia-nano-1) · [model license](https://huggingface.co/llamaindex/OCRia-nano-1/raw/main/LICENSE) · [LiteParse runtime](https://github.com/run-llama/liteparse)
- [Inkling-2-Mini model card](https://huggingface.co/thinkingmachines/Inkling-2-Mini) · [publisher model card](https://thinkingmachines.ai/model-card/inkling-2-mini/)
- [Ternary Bonsai model card](https://huggingface.co/prism-ml/Ternary-Bonsai-2.5-27B-GGUF)
- [Inworld Voice Isolator model card](https://huggingface.co/inworld/voice-isolator)
- [LTX-2.5 model card](https://huggingface.co/Lightricks/LTX-2.5) · [license](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x)
