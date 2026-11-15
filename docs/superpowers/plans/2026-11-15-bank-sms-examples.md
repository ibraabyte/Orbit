# Bank SMS: examples, AI fallback, ready Shortcut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user pastes example bank messages to make templates; matching purchases count by themselves, the rest is read by the user's AI (or the old reader) and waits for review; setup is one signed Shortcut file opened from the app.

**Architecture:** Reading order in `POST /bank-sms`: sensitive filter → user's templates (`app/services/bank_templates.py`) → AI (`app/services/bank_ai.py`) → generic `parse_sms`. Templates are stored as placeholder patterns with no personal values. A script builds and signs the `.shortcut` file on macOS; the API serves it. The app gets one Bank SMS screen.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Postgres, pytest; Expo Router, React Native, vitest; macOS `shortcuts sign`, Python `plistlib`.

**Spec:** `docs/superpowers/specs/2026-11-15-bank-sms-examples-design.md`

## Global Constraints

- Only purchases and fees ever count without approval, and only from a template match. AI and generic reads are always `needs_review`. Refunds from templates go to review.
- No message text, example text, real amount, merchant, or reference is stored. Templates keep placeholders only.
- The sensitive filter (`_SENSITIVE`, `_FULL_NUMBER`, `_ACCOUNT` in `app/services/bank_sms.py`) runs before templates, AI, and on examples. A sensitive example → `422` and nothing saved.
- AI is used only with an AI the user connected themselves (`whoop_ai.connected(db, user_id)` non-empty). The server's admin fallback key is never used for this.
- AI call timeout: 8 seconds. On failure or timeout, fall back to `parse_sms`.
- Income is out of scope: `transfer_in` stays saved and uncounted.
- App copy in English and Arabic (`src/lib/i18n.ts`), Arabic in plain فصحى مبسطة (see `ux-araby` skill). Western digits by default (`digits()`).
- Work on branch `feat/bank-sms-examples` in worktree `/Users/ibrahim/Projects/Orbit/.claude/worktrees/bank-sms-examples`. Don't touch other sessions' uncommitted files on `main`. Commit only when the user agrees; the commit steps below mark where.
- Backend tests: `cd backend && uv run pytest <path> -q` against `ORBIT_TEST_DATABASE_URL` (default `postgresql+psycopg://orbit:orbit@localhost:5432/orbit_test`). Lint: `uv run ruff check . && uv run ruff format --check .`. App: `npm run verify`.

## Review Focus

1. **A template that is too loose** counting a different message (e.g., a refund or a declined purchase whose text differs by one word). Expect: no match → review. Pinned in Task 2 (`test_one_word_different_does_not_match`, `test_declined_never_matches_a_purchase_template`).
2. **The same purchase arriving twice with different text** (Arabic + English copy). Expect: second one in review with `possible_duplicate`. Pinned in Task 4 (`test_same_amount_and_card_in_ten_minutes_goes_to_review`).
3. **The AI returning junk** (bad JSON, a kind not in `KINDS`, amount `"-5"`, currency `"BTC"`, a 16-digit card). Expect: fall back to `parse_sms`, never crash, never store junk. Pinned in Task 3 (`test_bad_ai_answers_fall_back`).
4. **The user's correction not found in the example** (they typed `25.5` but the text says `25.50`). Expect: `422` naming the field, nothing saved. Pinned in Task 2 (`test_value_not_in_example_is_refused`).
5. **Old Shortcuts that still send `bank`, `event_id`, `received_at`.** Expect: still accepted exactly as today. Pinned in Task 1 (existing `tests/test_bank_sms.py` stays green unchanged).

---

### Task 1: `bank` and `event_id` become optional; generic reader

**Files:**
- Create: `backend/alembic/versions/0029_bank_sms_templates.py` (`down_revision` = output of `uv run alembic heads` at build time; if another session's `0028` lands first, renumber)
- Modify: `backend/app/models/bank_sms.py` (`BankTransaction.bank` nullable; new `BankSmsTemplate`; `BankSmsToken.ai_read`)
- Modify: `backend/app/models/__init__.py` (export `BankSmsTemplate`)
- Modify: `backend/app/routers/bank_sms.py` (`Incoming`, `TransactionRow`, `_mac` inputs)
- Modify: `backend/app/services/bank_sms.py` (`parse_sms(bank: str | None, ...)`)
- Test: `backend/tests/test_bank_sms.py`, `backend/tests/test_bank_sms_parser.py`

**Interfaces:**
- Produces: `parse_sms(bank: str | None, message: str, *, verified: bool | None = None) -> dict` — with `bank=None`, purchase markers are the union of all banks' `purchase_markers`, and the reason `unverified_bank_format` is added.
- Produces: `Incoming.bank: Literal[...] | None = None`; `Incoming.event_id: uuid.UUID = Field(default_factory=uuid4)`.
- Produces: model `BankSmsTemplate(Owned, Base)`, table `bank_sms_templates`: `bank: str | None` (check in `BANKS`), `label: str` (≤ 60 chars), `kind: str` (check in `KINDS` minus `unknown`), `pattern: str` (≤ 4000 chars), `last_matched_at: datetime | None`. Cascades on user delete like the rest.
- Produces: `BankSmsToken.ai_read: bool`, server default `true`. `new_token` keeps the old row's value when replacing.
- Hash inputs use `(data.bank or "")` where they use `data.bank` today.

- [ ] **Step 1: Write failing tests** in `tests/test_bank_sms.py`:
  - `test_message_without_bank_or_event_id_is_read` — POST `{"message": PURCHASE}` → `201`, `transaction.bank is None`, `kind == "purchase"`, `status == "needs_review"`, `"unverified_bank_format" in review_reasons`.
  - `test_resent_without_event_id_is_flagged_not_doubled` — same body twice → second row has `possible_duplicate`.
  - in `tests/test_bank_sms_parser.py`: `test_no_bank_uses_every_banks_purchase_words` — `parse_sms(None, "عملية دفع; مبلغ: 10 SAR; لدى: X")["kind"] == "purchase"` (an STC-only marker).
- [ ] **Step 2: Run** `uv run pytest tests/test_bank_sms.py tests/test_bank_sms_parser.py -q` → the three new tests FAIL.
- [ ] **Step 3: Implement** the model, migration, and router/service changes above. Add `ai_read` and the templates table in the same migration.
- [ ] **Step 4: Run** `uv run pytest tests/test_bank_sms*.py -q && uv run alembic check` → all PASS, "No new upgrade operations detected".
- [ ] **Step 5: Commit** (with user's OK) `feat(bank-sms): bank and event_id optional, templates table`.

### Task 2: Templates — build, match, API

**Files:**
- Create: `backend/app/services/bank_templates.py`
- Modify: `backend/app/routers/bank_sms.py` (template routes)
- Test: `backend/tests/test_bank_templates.py`

**Interfaces:**
- Consumes: `_clean`, `_SENSITIVE`, `_FULL_NUMBER`, `_ACCOUNT`, `SensitiveMessage`, `CATEGORY_KEYWORDS`, `_SUPPORTED`, `_amount` from `app/services/bank_sms.py` (reuse; don't copy).
- Produces: `Fields = TypedDict("Fields", {"amount": str, "currency": str, "merchant": str | None, "card_last4": str | None, "reference": str | None, "wildcards": list[str]})` — every string as it appears in the example.
- Produces: `build_pattern(example: str, fields: Fields) -> str` — raises `ValueError("<field>_not_in_example")` when a value isn't a substring of `_clean(example)`; raises `SensitiveMessage` for sensitive examples.
- Produces: `match(pattern: str, message: str) -> dict | None` — returns the same dict shape as `parse_sms` (`kind` left to caller), or None.
- Produces: `read_with_templates(templates: list[BankSmsTemplate], message: str) -> dict | None` — the parse-shaped dict with `kind` from the template and `review_reasons == []`; `{"status": "needs_review", "review_reasons": ["template_conflict"], ...}` when two templates match with different amount/merchant/card; None when none match. Updates `last_matched_at` on the winner.
- Produces routes (session auth, `UserId`):
  - `POST /bank-sms/templates/preview` body `{"example": str}` → `{"fields": Fields, "kind": str, "words": list[str]}`. `fields` from `parse_sms(None, example)` mapped back to the raw substrings; `words` is the example split on whitespace for the "any text" chips. Saves nothing.
  - `POST /bank-sms/templates` body `{"example": str, "label": str, "kind": str, "bank": str | None, "fields": Fields}` → `201` `{"id", "label", "kind", "bank", "pattern", "created_at", "last_matched_at"}`. `422` with `detail` = the `ValueError` code.
  - `GET /bank-sms/templates` → list (same shape). `DELETE /bank-sms/templates/{id}` → `204`.

Pattern format (the one decision the tests don't fully pin): the stored pattern is the cleaned example with each field value replaced by a placeholder `{amount}`, `{currency}`, `{merchant}`, `{card}`, `{ref}`, each wildcard word by `{any}`, every remaining digit run (with `.,:/-` inside) by `{num}`, and literal `{`/`}` doubled. `match` compiles it: literal text `re.escape`d with runs of whitespace → `\s+`; `{amount}` → `(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`; `{currency}` → the currency alternatives `_MONEY` accepts; `{merchant}` → `([^;؛\n\r]{1,100}?)`; `{card}` → `(\d{4})`; `{ref}` → `([A-Za-z0-9_-]{1,64})`; `{num}` → `[\d.,:/-]+`; `{any}` → `[^;؛\n\r]{1,60}?`; `re.fullmatch` on `_clean(message).strip()` with `re.IGNORECASE`. Amount → minor units and currency normalisation reuse the same rules as `_amount`.

- [ ] **Step 1: Write failing tests** in `tests/test_bank_templates.py` (synthetic messages only):
  - `test_example_round_trips` — `build_pattern(EX, fields)` then `match(pattern, EX)` gives `amount_minor == 2550`, `currency == "SAR"`, `merchant == "Cafe Demo"`, `card_last4 == "1234"`.
  - `test_new_values_match` — same pattern, message with `199.00`, `Jarir Bookstore`, `*9876`, a different date and balance → those values.
  - `test_pattern_keeps_no_values` — `"25.50"`, `"Cafe Demo"`, `"1234"`, the reference, and a wildcard name (`"Ahmed"`) are not substrings of the pattern.
  - `test_one_word_different_does_not_match` — a refund text built from the same example with `شراء` → `استرداد` → `None`.
  - `test_declined_never_matches_a_purchase_template` — the example with `مرفوضة` added → `None`.
  - `test_value_not_in_example_is_refused` — `amount="25.5"` for text `25.50` → `ValueError("amount_not_in_example")`.
  - `test_sensitive_example_is_refused` — example containing `OTP 123456` → `SensitiveMessage`.
  - API: `test_preview_saves_nothing`, `test_create_list_delete`, `test_other_user_cannot_see_or_delete`, `test_create_with_wrong_value_is_422`.
- [ ] **Step 2: Run** `uv run pytest tests/test_bank_templates.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement** `bank_templates.py` and the routes.
- [ ] **Step 4: Run** `uv run pytest tests/test_bank_templates.py tests/test_bank_sms*.py -q` → PASS.
- [ ] **Step 5: Commit** (with user's OK) `feat(bank-sms): templates from pasted examples`.

### Task 3: AI reader

**Files:**
- Create: `backend/app/services/bank_ai.py`
- Modify: `backend/app/services/feature_models.py` (`AI_FEATURES` gets `"bank_sms"`)
- Modify: `backend/app/routers/bank_sms.py` (`GET`/`PATCH /bank-sms/settings`)
- Test: `backend/tests/test_bank_ai.py`

**Interfaces:**
- Consumes: `assistant.complete(access, system, prompt, max_tokens)`, `whoop_ai.access_for(db, user_id, feature="bank_sms")`, `whoop_ai.connected(db, user_id)`.
- Produces: `access(db, user_id) -> AiAccess | ChatgptAccess | None` — None unless `BankSmsToken.ai_read` is true **and** `whoop_ai.connected(...)` is non-empty.
- Produces: `read_with_ai(access, message: str, patterns: list[str]) -> dict | None` — sync; returns the parse-shaped dict with `status="needs_review"` and `review_reasons=["read_by_ai"]`, or None on any error or invalid answer. Asks for JSON `{"kind", "amount", "currency", "merchant", "card_last4"}`; validates `kind in KINDS`, amount via the `_amount` rules, `currency in _SUPPORTED`, merchant ≤ 100 chars, card `^\d{4}$` or null; category from `CATEGORY_KEYWORDS` like `parse_sms`.
- Produces: `GET /bank-sms/settings` → `{"ai_read": bool, "ai_available": bool}`; `PATCH /bank-sms/settings` body `{"ai_read": bool}` → same. `404` when no key exists.

- [ ] **Step 1: Write failing tests** in `tests/test_bank_ai.py` (monkeypatch `bank_ai.assistant.complete`, like `tests/test_calls.py:137`):
  - `test_good_answer_is_read_for_review` — answer JSON for 25.50 SAR → `amount_minor == 2550`, `review_reasons == ["read_by_ai"]`.
  - `test_bad_ai_answers_fall_back` — parametrized: `"not json"`, `{"kind": "salary"}`, amount `"-5"`, currency `"BTC"`, card `"1234567812345678"` → `None`.
  - `test_admin_server_key_is_not_used` — admin user with `settings.anthropic_api_key` set and no own AI → `access(...) is None`.
  - `test_switch_off_means_no_ai` — `PATCH /bank-sms/settings {"ai_read": false}` → `access(...) is None`.
- [ ] **Step 2: Run** `uv run pytest tests/test_bank_ai.py -q` → FAIL.
- [ ] **Step 3: Implement** `bank_ai.py`, the feature entry, and the settings routes.
- [ ] **Step 4: Run** `uv run pytest tests/test_bank_ai.py tests/test_feature_models*.py -q` → PASS (adjust any test that lists `AI_FEATURES` exactly).
- [ ] **Step 5: Commit** (with user's OK) `feat(bank-sms): AI reads messages no template matches`.

### Task 4: Wire the reading order and auto-count into `POST /bank-sms`

**Files:**
- Modify: `backend/app/routers/bank_sms.py` (`ingest`, `_save`)
- Test: `backend/tests/test_bank_sms_flow.py`

**Interfaces:**
- Consumes: `read_with_templates` (Task 2), `bank_ai.access` / `read_with_ai` (Task 3), `parse_sms` (Task 1).
- Order in `ingest`: sensitive check (call `parse_sms` first only for its `SensitiveMessage`, or factor the check into `check_sensitive(message)` in `bank_sms.py`) → templates → AI via `await asyncio.wait_for(run_in_threadpool(read_with_ai, ...), 8)` → `parse_sms`.
- Template purchase/fee with amount → `status="confirmed"` unless a row exists with the same `user_id`, `amount`, `currency`, `card_last4`, created in the last 10 minutes → `needs_review` + `possible_duplicate`. Template refund/other kinds → `needs_review` (+ `non_expense_movement` where `parse_sms` would add it).

- [ ] **Step 1: Write failing tests** in `tests/test_bank_sms_flow.py`:
  - `test_template_match_counts_by_itself` — create template, POST a new matching purchase → `status == "confirmed"`, one row in `/expenses`.
  - `test_template_refund_waits_for_review`.
  - `test_same_amount_and_card_in_ten_minutes_goes_to_review` — template purchase, then an English text (generic reader) with same amount and card → second is `needs_review` with `possible_duplicate`; and the reverse order too.
  - `test_no_template_uses_ai_then_review` — AI stub returns a purchase → `needs_review`, `read_by_ai`.
  - `test_ai_timeout_falls_back` — stub sleeps 9 s (monkeypatch the timeout to 0.1 s) → generic reader result.
  - `test_sensitive_never_reaches_templates_or_ai` — stubs that `raise AssertionError` → `422`.
- [ ] **Step 2: Run** `uv run pytest tests/test_bank_sms_flow.py -q` → FAIL.
- [ ] **Step 3: Implement** the order in `ingest` and the duplicate rule in `_save`.
- [ ] **Step 4: Run** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .` → full suite PASS, lint clean.
- [ ] **Step 5: Commit** (with user's OK) `feat(bank-sms): templates count by themselves, AI and reader go to review`.

### Task 5: Signed Shortcut file and download route

**Files:**
- Create: `backend/scripts/build_bank_shortcut.py`
- Create: `backend/app/static/orbit-bank-sms.shortcut` (generated, signed, committed)
- Modify: `backend/app/routers/bank_sms.py` (`GET /bank-sms/shortcut`)
- Test: `backend/tests/test_bank_shortcut.py`

**Interfaces:**
- Produces: `uv run python scripts/build_bank_shortcut.py --api https://orbit.apps.ibrabyte.app --out app/static/orbit-bank-sms.shortcut` — writes an unsigned plist with `plistlib` (actions: Text from Shortcut Input → Match Text OTP regex, If has any value → Stop → Match Text long-number regex, If → Stop → Get Contents of URL POST `{api}/bank-sms`, header `Authorization: Bearer <key>`, JSON `{"message": <text>}`), with one `WFWorkflowImportQuestions` entry asking for the key (EN + AR text), then runs `shortcuts sign --mode anyone --input <tmp> --output <out>`. Both regexes copied verbatim from `backend/BANK_SMS.md`. Exits non-zero with a clear message off macOS.
- Produces: `GET /bank-sms/shortcut` — public, `FileResponse`, `Content-Disposition: attachment; filename="Orbit Bank SMS.shortcut"`.

- [ ] **Step 1: Write failing tests:** `test_shortcut_is_public_and_has_no_key` — `200`, no `Authorization` needed, body bytes don't contain `orbit_sms_`; `test_builder_plist_has_both_filters_and_the_question` — call the script's `build_plist(api)` (pure function) and assert both regex strings, the URL, and one import question are present.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the script and the route; run the script on this Mac to produce the signed file.
- [ ] **Step 4: Verify** tests PASS; then on this Mac `open app/static/orbit-bank-sms.shortcut` imports it into Shortcuts, asks for the key, and `shortcuts run "Orbit Bank SMS" --input-path <file with PURCHASE text>` against a local API (port from `~/Projects/Bawaba/bawaba check`) creates a `needs_review` row. Record what worked.
- [ ] **Step 5: Commit** (with user's OK) `feat(bank-sms): signed Shortcut file`.

### Task 6: App — Bank SMS screen

**Files:**
- Create: `src/app/bank-sms.tsx`
- Modify: `src/components/bank-sms-card.tsx` (tile only; press → `router.push("/bank-sms")`; key logic moves to the screen)
- Modify: `src/lib/bank-sms.ts` (types + API), `src/lib/i18n.ts` (strings), `src/components/bank-review-card.tsx` (AI badge, `bank` may be null)
- Modify: `src/app/_layout.tsx` only if new screens must be listed there (check how `integrations` is registered)
- Test: `src/lib/__tests__/bank-sms.test.ts`

**Interfaces:**
- Consumes: routes from Tasks 2, 3, 5.
- Produces in `src/lib/bank-sms.ts`: `BankTransaction.bank: BankCode | null`; `type TemplateFields = { amount: string; currency: string; merchant: string | null; card_last4: string | null; reference: string | null; wildcards: string[] }`; `type BankTemplate = { id: string; label: string; kind: BankKind; bank: BankCode | null; pattern: string; created_at: string; last_matched_at: string | null }`; `bankSmsApi.preview(api, example)`, `.createTemplate(api, body)`, `.templates(api)`, `.deleteTemplate(api, id)`, `.settings(api)`, `.setAi(api, on)`; `shortcutUrl(base: string) => string`; `isReadByAi(row) => boolean`; `bankName(row) => string` (falls back to `t.bankSms` when `bank` is null).
- Screen sections, top to bottom: key (create / share / replace / off — moved from the card unchanged), "Install Shortcut" button (`Linking.openURL(shortcutUrl(EXPO_PUBLIC_API_URL))`), 3–4 Arabic/English automation steps, "Message examples" list with "Add example" (paste → preview → editable fields + kind picker + tappable word chips for "any text" + label → save), AI switch (hidden when `ai_available` is false).

- [ ] **Step 1: Write failing tests** in `src/lib/__tests__/bank-sms.test.ts`: `shortcutUrl("https://x/")` → `"https://x/bank-sms/shortcut"`; `isReadByAi` true only with `read_by_ai`; `bankName` with `bank: null` returns the generic label; `canConfirm` unchanged for null bank.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/bank-sms.test.ts` → FAIL.
- [ ] **Step 3: Implement** lib, strings, screen, card, review badge. Use existing `drift` components (`Card`, `ListRow`, `Badge`, `RowButton`, `EmptyState`) and `Input`/`Button` from `@/components/screen`, like `budget-card.tsx`.
- [ ] **Step 4: Run** `npm run verify` → PASS.
- [ ] **Step 5: Verify on the iOS simulator** (Expo Go, local API and test DB): English and Arabic — tile opens the screen; create key; "Install Shortcut" opens a URL; paste the synthetic `PURCHASE` example, fix a field, mark a word as any-text, save; template appears; POST a matching message with curl → it shows in expenses without review; a non-matching one shows in review with the AI badge (stubbed AI) or without.
- [ ] **Step 6: Commit** (with user's OK) `feat(bank-sms): one screen for setup, examples and AI`.

### Task 7: Docs and Brain

**Files:**
- Modify: `backend/BANK_SMS.md` (new order, templates, AI, Shortcut file, optional fields; iPhone setup shrinks to: install file → paste key → one automation)
- Create: `docs/brain/decisions/2026-11-15-bank-sms-templates-and-ai.md` (AI sends unmatched text to the user's own provider; template auto-count rule)
- Create: `docs/brain/handoffs/2026-11-15-bank-sms-examples.md`; Modify: `docs/brain/current-state.md` (one section)

- [ ] **Step 1:** Write the three docs in Arabic, with what was tested and what wasn't (real iPhone, real bank messages, one automation for all senders).
- [ ] **Step 2: Commit** (with user's OK) `docs(bank-sms): templates, AI and Shortcut`.
