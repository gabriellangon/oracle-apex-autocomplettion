# APEX API Dictionary Generation

This folder contains the tools to generate the APEX PL/SQL API dictionary used for autocompletion.

## Current Version

- **APEX Version**: 24.2
- **Last Updated**: 2026-02

## Files

| File | Description |
|------|-------------|
| `query.sql` | Oracle SQL query to extract all APEX packages, procedures, functions, return types, and arguments. |
| `apex-public-plsql-api.json` | List of public APEX API packages (from official Oracle documentation). |
| `generate_apex_api.py` | Python script to convert the CSV export into the JSON dictionary. |

## How to Update the Dictionary

### Step 1: Export from Oracle Database

Run `query.sql` in SQL Developer or SQL*Plus against an APEX schema:

```sql
-- Connect to your APEX database
@query.sql
```

Export the results as a CSV with headers:
- **File**: `apex-24.2-export.csv` (or appropriately named depending on your APEX version)
- **Encoding**: UTF-8
- **Delimiter**: comma

### Step 2: Generate the JSON Dictionary

```bash
cd scripts

# Update the CSV_INPUT filename inside generate_apex_api.py if necessary
python3 generate_apex_api.py
```

This will:
1. Read the CSV export.
2. Filter to keep only public APIs (allowed aliases listed in `apex-public-plsql-api.json`).
3. Merge arguments from overloaded subprograms into a single rich signature.
4. Generate `../extension/dictionaries/apex-api.json`.

### Step 3: Test

1. Reload the extension in Chrome (`chrome://extensions`).
2. Refresh your APEX page.
3. Test the autocompletion (hover over or autocomplete to see the full signatures and return types).

## Output Format

The generated JSON follows this structure:

```json
{
  "packages": [
    {
      "name": "APEX_ACL",
      "procedures": [
        {
          "label": "APEX_ACL.ADD_USER_ROLE",
          "detail": "WWV_FLOW_ACL_API.ADD_USER_ROLE",
          "kind": "procedure",
          "signature": "APEX_ACL.ADD_USER_ROLE(p_user_name IN VARCHAR2, p_role_id IN NUMBER)"
        },
        {
          "label": "APEX_UTIL.GET_SESSION_ID",
          "detail": "WWV_FLOW_UTILITIES.GET_SESSION_ID",
          "kind": "function",
          "returnType": "NUMBER",
          "signature": "APEX_UTIL.GET_SESSION_ID RETURN NUMBER"
        }
      ]
    }
  ]
}
```

## Versioning Strategy

**Additive approach**: We keep all functions across APEX versions.

- New functions are added when updating to a newer APEX version.
- Deprecated functions are NOT removed (they remain valid for older APEX instances).
- This ensures compatibility with all APEX versions.

## Adding a New APEX Package

1. Add the package name to `apex-public-plsql-api.json`.
2. Re-run the generation process.

## Notes

- The query distinguishes functions from procedures using `ALL_ARGUMENTS.POSITION = 0` (which implies a return type).
- Functions include an additional `returnType` field, and a `RETURN` clause in their signature string.
- Overloaded procedures/functions are merged into a single signature mapping. This shows all available parameters in the autocomplete snippet without duplicating autocomplete options.
- The `detail` field contains the internal Oracle package name (e.g., `WWV_FLOW_UTILITIES`), while `label` contains the public synonym (e.g., `APEX_UTIL`).
