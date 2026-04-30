# Company Screener — Scoring Mechanism

This document explains every step of the scoring pipeline, from raw text to
final ranked output.  All scoring runs inside a compiled C extension
(`scoring_ext.dll`) loaded into SQLite at query time.  Parameters are read from
`scoring_config.json` — no recompilation needed to tune behaviour.

---

## 1. Index Structure

Each company occupies **one row** in a SQLite FTS5 virtual table with **9
description columns**.  FTS5 tokenizes every word with the **Porter stemmer**
and Unicode folding (`tokenize='porter unicode61'`), so "manufacturing",
"manufacturer", and "manufacturers" all reduce to the same stem and match each
other.

| Column # | FTS5 Name          | Excel Source              |
|----------|--------------------|---------------------------|
| 0        | pitchbook_desc     | Pitchbook Description     |
| 1        | pitchbook_keywords | Pitchbook Keywords        |
| 2        | company_desc       | Company Description       |
| 3        | factset_desc       | Factset Description       |
| 4        | offerings          | Offerings                 |
| 5        | naics_desc         | NAICS Description         |
| 6        | demandbase_desc    | Demandbase Description    |
| 7        | salesforce_desc    | Salesforce Description    |
| 8        | dealogic_desc      | Dealogic Description      |

---

## 2. Query Construction

For each analyst keyword the app builds an FTS5 term:

- **Single word** (e.g. `supply`) → `supply*` (prefix match — also matches
  "supplier", "supplies", "supplying")
- **Multi-word phrase** (e.g. `air filter`) → `"air filter"` (exact phrase
  match)

All include keywords are joined with `OR`:

```
supply* OR "air filter" OR hvac*
```

Exclude keywords run as separate queries first to build an exclusion set.

---

## 3. C Extension Scoring (`custom_rank`)

The SQL call looks like:

```sql
SELECT rowid, custom_rank(company_fts, 3.0, 1.0, 2.0) as rank
FROM company_fts
WHERE company_fts MATCH 'supply* OR "air filter" OR hvac*'
ORDER BY rank
LIMIT 50000
```

The positional arguments after the table name are **keyword weights** — one per
phrase in the MATCH query, in order.  These correspond to the analyst-assigned
weights (1–5x) from the UI.

### Step 1 — Term Frequency Counting

For every (phrase, column) pair, the extension counts exact hit instances using
the FTS5 `xInst()` API:

```
tf[phrase][column] = number of times phrase appears in that column for this row
```

### Step 2 — BM25-style Saturation (per cell)

Each cell score is a saturating function of term frequency, **without** document
length normalization (all descriptions are treated equally regardless of
length):

```
S(k, C, c) = tf(k,C,c) * (k1 + 1) / (tf(k,C,c) + k1)
```

Where `k1` is the saturation constant from `scoring_config.json` (default 1.2).

**Intuition:** the first occurrence of a term in a cell contributes the most.
Repeated mentions give diminishing returns.  This prevents a company that
mentions "HVAC" 50 times from unfairly dominating one that mentions it 3 times
in the right places.

| tf | S (k1=1.2) | Marginal gain |
|----|------------|---------------|
| 0  | 0.000      | —             |
| 1  | 1.000      | +1.000        |
| 2  | 1.375      | +0.375        |
| 3  | 1.571      | +0.196        |
| 5  | 1.774      | +0.101/hit    |
| 10 | 1.964      | +0.038/hit    |
| ∞  | 2.200      | → 0           |

### Step 3 — Source Weight Multiplication

Each column has an importance weight reflecting data quality and relevance.
Higher-weighted sources contribute more to a company's score:

```
WCS(k, C, c) = S(k, C, c) × W_c
```

| Column                | Weight (W_c) | Rationale                                    |
|-----------------------|-------------|----------------------------------------------|
| Pitchbook Description | 2.0         | Curated, highest signal                      |
| Pitchbook Keywords    | 1.5         | Pre-tagged terms, strong indicator            |
| Company Description   | 1.2         | Self-reported, usually accurate               |
| Factset Description   | 1.0         | Third-party, reliable baseline                |
| Offerings             | 1.0         | Product/service list, directly relevant       |
| NAICS Description     | 0.8         | Standardized industry codes, sometimes broad  |
| Demandbase Description| 0.8         | Marketing-oriented, less precise              |
| Salesforce Description| 0.8         | Internal CRM notes, variable quality          |
| Dealogic Description  | 0.8         | Deal-focused, narrow coverage                 |

These weights are configurable in `scoring_config.json` under `source_weights`.

### Step 4 — Per-Keyword Score

Sum the weighted cell scores across all columns for each keyword:

```
KS(k, C) = Σ_c  WCS(k, C, c)
```

This gives a single score measuring how strongly a company matches one keyword
across all data sources.

### Step 5 — Weighted Keyword Aggregation

Combine all keyword scores using the analyst-assigned keyword weights:

```
WKS(C) = Σ_k  w_k × KS(k, C)
```

Where `w_k` is the weight passed as the SQL argument (1x–5x).  A keyword
weighted 3x contributes three times as much to the final score as one weighted
1x.

### Step 6 — Cross-Column Synergy Bonus

Companies that match keywords across multiple data sources get a bonus.  The
idea: if HVAC appears in both the Pitchbook Description AND the Offerings
column, that's stronger evidence than seeing it in just one place.

```
coverage(c) = |{keywords with tf > 0 in column c}| / N_keywords
total_coverage = Σ_c  coverage(c)
synergy = 1.0 + γ × total_coverage
```

Where `γ` (gamma) is the synergy multiplier from config (default 0.2).

**Example:** 3 keywords, and column 0 has 2 of them, column 4 has 1 of them,
other columns have 0:
```
coverage(0) = 2/3 = 0.667
coverage(4) = 1/3 = 0.333
total_coverage = 1.0
synergy = 1.0 + 0.2 × 1.0 = 1.20  (20% bonus)
```

### Step 7 — Relevance Score

```
relevance(C) = WKS(C) × synergy(C)
```

This is the final quality-of-match score for the company.

### Step 8 — Completeness (Keyword Coverage)

Completeness measures what fraction of the analyst's keywords were found:

```
completeness_raw = Σ  w_k  (for each keyword k that matched at least one column)
completeness = completeness_raw / Σ  w_k  (over all keywords)
```

A company matching all keywords has completeness = 100%.  Weights matter: if a
3x keyword is missed but a 1x keyword matches, completeness is only 25% (1/4).

### Step 9 — Encoded Return Value

The C extension packs both completeness and relevance into a single double for
FTS5's `rank` column:

```
rank = -(completeness_raw × 10^8 + relevance)
```

FTS5 sorts `rank ASC`, so the most negative value (highest completeness and
relevance) comes first.

Python decodes on the other side:

```python
raw = -rank
completeness_raw = raw // 1e8        # integer part
relevance = raw - completeness_raw * 1e8  # fractional part
completeness = completeness_raw / total_keyword_weight
```

---

## 4. Tier Assignment (Python)

After the C extension returns scored results, Python assigns tiers based on
keyword completeness:

| Tier | Condition              | Meaning                           |
|------|------------------------|-----------------------------------|
| 1    | completeness >= 100%   | All keywords matched              |
| 2    | completeness >= 50%    | At least half of keyword weight   |
| 3    | completeness < 50%     | Partial match                     |

Results are sorted by **(tier ASC, relevance DESC)** — Tier 1 companies always
appear before Tier 2, and within each tier, higher relevance ranks first.

---

## 5. Expression Mode

When the analyst writes a boolean expression like `(1 AND 2) OR (3 AND 4)`:

1. Each keyword runs independently to produce a set of matching company IDs.
2. The boolean expression is evaluated as set operations (AND = intersection,
   OR = union, NOT = complement).
3. Only companies in the final result set are kept.
4. Scoring still uses the C extension with all positive keywords OR'd together.
5. All surviving companies are treated as **Tier 1** (the expression itself
   defines what "complete match" means).

---

## 6. Exclude Keywords

Exclude keywords are processed **before** scoring:

1. Run an FTS5 query for the exclude keyword.
2. Collect all matching company IDs into an exclusion set.
3. Pass the exclusion set to `search_with_scoring`, which skips those companies.

Excluded companies never appear in results, regardless of how well they match
include keywords.

---

## 7. Highlight Snippets

Highlights are fetched **separately** from scoring (can be toggled off in the
UI for faster results):

1. For each include keyword, run FTS5 `snippet()` across each of the 9 columns.
2. `snippet()` returns a short context window with `<mark>...</mark>` tags
   around matching terms.
3. Only the top 50 results get highlights (configurable) to keep latency low.
4. Snippets are rendered as styled HTML cards with source and keyword badges.

---

## 8. Tuning Guide

All parameters live in `scoring_config.json`.  Edit and restart the app — no
recompilation needed.

| Parameter        | Default | Effect of Increasing                          |
|------------------|---------|-----------------------------------------------|
| `k1`             | 1.2     | More credit for repeated term occurrences.  Higher values make tf matter more; lower values (toward 0) make any mention equally valuable. |
| `gamma`          | 0.2     | Stronger bonus for cross-column spread.  At 0, synergy is disabled. |
| `source_weights` | varies  | Boost or reduce the influence of specific data sources.  Set a weight to 0 to completely ignore a column. |
| Keyword weight   | 1–5x    | Set per keyword in the UI.  A 5x keyword dominates scoring — missing it tanks completeness. |

### Practical examples

**"I want Pitchbook data to matter much more"**
→ Increase `source_weights[0]` (e.g. from 2.0 to 4.0).

**"Companies should rank high even with just one mention"**
→ Decrease `k1` (e.g. from 1.2 to 0.5).  Saturation will be more aggressive,
making 1 hit nearly as valuable as 5.

**"Cross-source confirmation should be a bigger deal"**
→ Increase `gamma` (e.g. from 0.2 to 0.5).  Companies matching keywords across
multiple data sources will get a larger bonus.

---

## 9. End-to-End Example

**Setup:** Keywords = HVAC (3x, include), manufacturer (1x, include),
private equity (exclude).

1. **Exclude pass:** FTS5 finds 120 companies matching "private equity" →
   exclusion set of 120 CIDs.

2. **Scoring pass:** FTS5 runs `MATCH 'hvac* OR manufacturer*'` with
   `custom_rank(company_fts, 3.0, 1.0)`.

3. **For Company X:**
   - "HVAC" appears 4 times in pitchbook_desc (tf=4), 1 time in offerings (tf=1)
   - "manufacturer" appears 2 times in company_desc (tf=2)

   Per-cell saturation (k1=1.2):
   ```
   S(hvac, pitchbook_desc) = 4×2.2 / (4+1.2) = 1.692
   S(hvac, offerings)      = 1×2.2 / (1+1.2) = 1.000
   S(mfr,  company_desc)   = 2×2.2 / (2+1.2) = 1.375
   ```

   Source weighting:
   ```
   WCS(hvac, pitchbook_desc) = 1.692 × 2.0 = 3.385
   WCS(hvac, offerings)      = 1.000 × 1.0 = 1.000
   WCS(mfr,  company_desc)   = 1.375 × 1.2 = 1.650
   ```

   Per-keyword scores:
   ```
   KS(hvac) = 3.385 + 1.000 = 4.385
   KS(mfr)  = 1.650
   ```

   Weighted aggregation:
   ```
   WKS = 3.0 × 4.385 + 1.0 × 1.650 = 14.805
   ```

   Synergy:
   ```
   coverage(pitchbook_desc) = 1/2 = 0.5  (only hvac)
   coverage(company_desc)   = 1/2 = 0.5  (only mfr)
   coverage(offerings)      = 1/2 = 0.5  (only hvac)
   total_coverage = 1.5
   synergy = 1.0 + 0.2 × 1.5 = 1.30
   ```

   Final:
   ```
   relevance = 14.805 × 1.30 = 19.247
   completeness_raw = 3.0 + 1.0 = 4.0  (both keywords matched)
   completeness = 4.0 / 4.0 = 100% → Tier 1
   encoded rank = -(4.0 × 1e8 + 19.247) = -400000019.247
   ```

4. **Tier assignment:** completeness = 100% → Tier 1.

5. **Display:** Company X appears in Tier 1, sorted by relevance (19.25) among
   other Tier 1 companies.
