/*
 * scoring_ext.c - SQLite FTS5 auxiliary functions for company scoring.
 *
 * Reads scoring parameters from scoring_config.json on first invocation.
 * Registers:
 *   - custom_rank
 *   - custom_match_mask
 *
 * Usage in SQL:
 *   SELECT rowid, custom_rank(company_fts, <kw_weight_1>, <kw_weight_2>, ...)
 *   FROM company_fts
 *   WHERE company_fts MATCH '<phrase1> OR <phrase2> OR ...'
 *   ORDER BY rank;
 *
 * Return value (double):
 *   -(completeness * 1e8 + relevance)
 *
 * Python decodes:
 *   raw = -rank
 *   completeness_raw = floor(raw / 1e8)   -> sum of matched keyword weights
 *   relevance         = raw - completeness_raw * 1e8
 *   completeness      = completeness_raw / sum_all_keyword_weights
 *
 * Compile (MinGW-w64):
 *   x86_64-w64-mingw32-gcc -shared -O2 -Wall -Wextra \
 *       -o scoring_ext.dll scoring_ext.c \
 *       -Ivendor/sqlite-amalgamation-3490100
 */

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

/* FTS5 types are defined in sqlite3.h (v3.49+) - no forward decls needed. */

/* ------------------------------------------------------------------ */
/* Scoring configuration - loaded once from scoring_config.json       */
/* ------------------------------------------------------------------ */

#define MAX_COLS    16
#define MAX_PHRASES 64

static double g_k1 = 1.2;
static double g_gamma = 0.2;
static double g_source_weights[MAX_COLS] = {
    2.0, 1.5, 1.2, 1.0, 1.0, 0.8, 0.8, 0.8, 0.8,
    0, 0, 0, 0, 0, 0, 0
};
static int g_num_cols = 9;
static int g_config_loaded = 0;

/*
 * Minimal JSON loader for scoring_config.json.
 * Parses: k1, gamma, source_weights[].
 * Hardcoded filename - reads from current working directory.
 */
static void load_scoring_config(void) {
    char *buf;
    char *p;
    long flen;
    FILE *f;

    if (g_config_loaded) {
        return;
    }
    g_config_loaded = 1;

    {
        const char *env_path = getenv("SCORING_CONFIG_PATH");
        f = fopen(env_path ? env_path : "scoring_config.json", "r");
    }
    if (!f) {
        return;  /* silently use defaults */
    }

    fseek(f, 0, SEEK_END);
    flen = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (flen <= 0 || flen > 65536) {
        fclose(f);
        return;
    }

    buf = (char *)malloc((size_t)(flen + 1));
    if (!buf) {
        fclose(f);
        return;
    }
    fread(buf, 1, (size_t)flen, f);
    buf[flen] = '\0';
    fclose(f);

    /* k1 */
    p = strstr(buf, "\"k1\"");
    if (p) {
        p = strchr(p + 4, ':');
        if (p) {
            g_k1 = strtod(p + 1, NULL);
        }
    }

    /* gamma */
    p = strstr(buf, "\"gamma\"");
    if (p) {
        p = strchr(p + 7, ':');
        if (p) {
            g_gamma = strtod(p + 1, NULL);
        }
    }

    /* source_weights array */
    p = strstr(buf, "\"source_weights\"");
    if (p) {
        p = strchr(p, '[');
        if (p) {
            int i = 0;
            p++;
            while (*p && *p != ']' && i < MAX_COLS) {
                while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t' || *p == ',') {
                    p++;
                }
                if (*p == ']') {
                    break;
                }
                {
                    char *end;
                    double v = strtod(p, &end);
                    if (end == p) {
                        break;
                    }
                    g_source_weights[i++] = v;
                    p = end;
                }
            }
            if (i > 0) {
                g_num_cols = i;
            }
        }
    }

    free(buf);
}

/* ------------------------------------------------------------------ */
/* FTS5 auxiliary function: custom_rank                               */
/*                                                                    */
/* Arguments (via SQL): keyword weights, one per phrase.              */
/*   custom_rank(company_fts, 3.0, 1.0)                               */
/*   -> phrase 0 weight = 3.0, phrase 1 weight = 1.0                  */
/*                                                                    */
/* Returns: -(completeness_raw * 1e8 + relevance)                     */
/*   where completeness_raw = sum of matched keyword weights          */
/*         relevance = WKS * synergy                                  */
/* ------------------------------------------------------------------ */

static void custom_rank_func(
    const Fts5ExtensionApi *pApi,
    Fts5Context *pFts,
    sqlite3_context *pCtx,
    int nVal,
    sqlite3_value **apVal
) {
    int nCol, nPhrase, nInst;
    int effCols, effPhrases;
    int rc;
    int i, p, c;

    /* tf[phrase][col] - term frequency counts */
    int tf[MAX_PHRASES][MAX_COLS];
    double kw_weights[MAX_PHRASES];
    int col_kw_count[MAX_COLS];

    double matched_kw_weight, wks;
    double total_coverage, synergy, relevance, encoded;

    load_scoring_config();

    nCol = pApi->xColumnCount(pFts);
    nPhrase = pApi->xPhraseCount(pFts);
    rc = pApi->xInstCount(pFts, &nInst);
    if (rc != SQLITE_OK) {
        sqlite3_result_double(pCtx, 0.0);
        return;
    }

    effPhrases = (nPhrase < MAX_PHRASES) ? nPhrase : MAX_PHRASES;
    effCols = (nCol < g_num_cols) ? nCol : g_num_cols;
    if (effPhrases <= 0 || effCols <= 0) {
        sqlite3_result_double(pCtx, 0.0);
        return;
    }

    memset(tf, 0, sizeof(tf));
    for (i = 0; i < nInst; i++) {
        int iPhrase, iCol, iOff;
        rc = pApi->xInst(pFts, i, &iPhrase, &iCol, &iOff);
        if (rc == SQLITE_OK && iPhrase < MAX_PHRASES && iCol < MAX_COLS) {
            tf[iPhrase][iCol]++;
        }
    }

    for (p = 0; p < effPhrases; p++) {
        kw_weights[p] = (p < nVal) ? sqlite3_value_double(apVal[p]) : 1.0;
    }

    matched_kw_weight = 0.0;
    wks = 0.0;
    memset(col_kw_count, 0, sizeof(col_kw_count));

    for (p = 0; p < effPhrases; p++) {
        double ks = 0.0;
        int matched = 0;

        for (c = 0; c < effCols; c++) {
            if (tf[p][c] > 0) {
                double s = ((double)tf[p][c] * (g_k1 + 1.0))
                         / ((double)tf[p][c] + g_k1);
                ks += s * g_source_weights[c];
                matched = 1;
                col_kw_count[c]++;
            }
        }

        if (matched) {
            matched_kw_weight += kw_weights[p];
        }
        wks += kw_weights[p] * ks;
    }

    total_coverage = 0.0;
    for (c = 0; c < effCols; c++) {
        total_coverage += (double)col_kw_count[c] / (double)effPhrases;
    }
    synergy = 1.0 + g_gamma * total_coverage;

    relevance = wks * synergy;
    encoded = -(matched_kw_weight * 1e8 + relevance);

    sqlite3_result_double(pCtx, encoded);
}

/* ------------------------------------------------------------------ */
/* FTS5 auxiliary function: custom_match_mask                         */
/*                                                                    */
/* Returns a 64-bit bitmask where bit p is set if phrase p matched    */
/* the current row. Allows Python to determine per-keyword matches    */
/* without issuing separate per-keyword SQL queries.                  */
/* ------------------------------------------------------------------ */

static void custom_match_mask_func(
    const Fts5ExtensionApi *pApi,
    Fts5Context *pFts,
    sqlite3_context *pCtx,
    int nVal,
    sqlite3_value **apVal
) {
    int nInst, rc, i;
    sqlite3_int64 mask = 0;
    (void)nVal;
    (void)apVal;

    rc = pApi->xInstCount(pFts, &nInst);
    if (rc != SQLITE_OK) {
        sqlite3_result_int64(pCtx, 0);
        return;
    }

    for (i = 0; i < nInst; i++) {
        int iPhrase, iCol, iOff;
        rc = pApi->xInst(pFts, i, &iPhrase, &iCol, &iOff);
        if (rc == SQLITE_OK && iPhrase < 64) {
            mask |= ((sqlite3_int64)1 << iPhrase);
        }
    }

    sqlite3_result_int64(pCtx, mask);
}

/* ------------------------------------------------------------------ */
/* Extension entry point                                              */
/* ------------------------------------------------------------------ */

#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_scoringext_init(
    sqlite3 *db,
    char **pzErrMsg,
    const sqlite3_api_routines *pApi
) {
    fts5_api *pFts5Api = NULL;
    sqlite3_stmt *pStmt = NULL;
    int rc;

    SQLITE_EXTENSION_INIT2(pApi);

    rc = sqlite3_prepare_v2(db, "SELECT fts5(?1)", -1, &pStmt, 0);
    if (rc != SQLITE_OK) {
        if (pzErrMsg) {
            *pzErrMsg = sqlite3_mprintf(
                "scoring_ext: cannot prepare FTS5 query: %s",
                sqlite3_errmsg(db)
            );
        }
        return rc;
    }

    rc = sqlite3_bind_pointer(pStmt, 1, (void *)&pFts5Api, "fts5_api_ptr", NULL);
    if (rc != SQLITE_OK) {
        sqlite3_finalize(pStmt);
        if (pzErrMsg) {
            *pzErrMsg = sqlite3_mprintf("scoring_ext: bind_pointer failed");
        }
        return rc;
    }

    sqlite3_step(pStmt);
    sqlite3_finalize(pStmt);

    if (pFts5Api == NULL) {
        if (pzErrMsg) {
            *pzErrMsg = sqlite3_mprintf(
                "scoring_ext: FTS5 API not available - is FTS5 enabled?"
            );
        }
        return SQLITE_ERROR;
    }

    rc = pFts5Api->xCreateFunction(
        pFts5Api,
        "custom_rank",
        NULL,
        custom_rank_func,
        NULL
    );
    if (rc != SQLITE_OK) {
        if (pzErrMsg) {
            *pzErrMsg = sqlite3_mprintf(
                "scoring_ext: failed to register custom_rank"
            );
        }
        return rc;
    }

    rc = pFts5Api->xCreateFunction(
        pFts5Api,
        "custom_match_mask",
        NULL,
        custom_match_mask_func,
        NULL
    );
    if (rc != SQLITE_OK) {
        if (pzErrMsg) {
            *pzErrMsg = sqlite3_mprintf(
                "scoring_ext: failed to register custom_match_mask"
            );
        }
        return rc;
    }

    return SQLITE_OK;
}
