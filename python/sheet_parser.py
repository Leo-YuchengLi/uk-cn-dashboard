#!/usr/bin/env python3
"""
AI-powered Excel sheet parser.
Sends raw grid data to Gemini for intelligent structure recognition,
then stores structured JSON for the dashboard.
"""

import sys
import os
import re
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# Fix Windows GBK encoding crash
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import sqlite3
import time
from pathlib import Path

import openpyxl


DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'airline.db')
GEMINI_MODEL = 'gemini-2.5-flash'
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'


def extract_snapshot_date(filepath):
    match = re.search(r'(\d{8})', Path(filepath).stem)
    if match:
        return match.group(1)
    raise ValueError(f"Cannot extract date from filename: {filepath}")


def read_sheet_as_grid(ws, max_row=120, max_col=80):
    """Read sheet into a 2D list for easier access."""
    grid = []
    for i, row in enumerate(ws.iter_rows(max_row=max_row, max_col=max_col, values_only=True)):
        grid.append(list(row))
        if i >= max_row:
            break
    return grid


# ─── Gemini API ───

def call_gemini(prompt, api_key, temperature=0):
    """Call Gemini API and return the text response."""
    url = f'{GEMINI_URL}?key={api_key}'
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': temperature,
            'responseMimeType': 'application/json',
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        text = result['candidates'][0]['content']['parts'][0]['text']
        return text
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f"Gemini API error {e.code}: {body}")


def grid_to_text(grid, max_rows=None):
    """Convert a 2D grid to a readable text table for AI consumption.
    Uses TSV format with row numbers for precise reference.
    """
    # Trim trailing empty rows and cols
    while grid and all(c is None for c in grid[-1]):
        grid = grid[:-1]
    if not grid:
        return "(empty sheet)"

    max_col = 0
    for row in grid:
        for ci in range(len(row) - 1, -1, -1):
            if row[ci] is not None:
                max_col = max(max_col, ci + 1)
                break

    lines = []
    rows_to_show = grid[:max_rows] if max_rows else grid
    for ri, row in enumerate(rows_to_show):
        cells = []
        for ci in range(max_col):
            val = row[ci] if ci < len(row) else None
            if val is None:
                cells.append('')
            elif isinstance(val, float):
                # Keep precision for percentages, round for large numbers
                if abs(val) < 1:
                    cells.append(f'{val:.6f}')
                elif abs(val) < 100:
                    cells.append(f'{val:.4f}')
                else:
                    cells.append(f'{val:.2f}')
            else:
                cells.append(str(val))
        lines.append(f'R{ri}:\t' + '\t'.join(cells))

    return '\n'.join(lines)


def _serialize_cell(v):
    """Convert a cell value to something JSON-safe."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    return str(v)


# ─── AI Schema Prompts ───

SHEET_PROMPTS = {}

SHEET_PROMPTS['month_share'] = """You are parsing an airline market share Excel sheet called "Month share - Pax".
This sheet contains UK-China airline route data viewed from Air China (CA) perspective.

The sheet has multiple tables/sections. Extract ALL of them:

## Table 1: triptype (Airlines × Trip Types)
A table with airline codes (CA, MU, CZ, HU, BA, etc.) as rows, and trip type columns: D+I, I+I, P2P (or 点点), Grand Total.
- Extract each airline row and the Grand Total row separately.

## Table 2: share (Market Share + Weekly Comparison)
A larger table with airlines as rows. It contains multiple column groups:
- **Share columns**: Monthly market share percentages (values 0-1 representing %, e.g. 0.35 = 35%). Column headers are month names.
- **Current week columns**: Absolute passenger numbers for the current week, by month. Headers are month names.
- **Current week total**: TTL column for current week.
- **WoW % change**: A single column showing week-over-week total change (value like 0.05 = 5%).
- **Previous week columns**: Absolute passenger numbers for the previous week, by month.
- **Previous week total**: TTL column for previous week.
- **WoW change by month**: Week-over-week change for each month (can be negative).
- **Previous share**: Previous period's total share percentage.

The last row might be "TTL" or "TOTAL" — rename to "TOTAL".

## Table 3: triptype_detail (Bottom Detail)
Usually at the bottom of the sheet. Three sub-tables side by side, all sharing the same airline rows:
- **Absolute**: D+I, I+I, P2P, TTL passenger counts
- **Market share %**: Each airline's % of total market for each trip type (0-1 values)
- **Airline share %**: Each trip type's % within the airline (0-1 values)

Return JSON with this EXACT structure:
{
  "triptype": [{"airline": "CA", "D+I": 1234, "I+I": 567, "P2P": 89, "total": 1890}, ...],
  "triptype_total": {"D+I": 10000, "I+I": 5000, "P2P": 1000, "total": 16000},
  "share": [
    {
      "airline": "CA",
      "share_<MONTH1>": 0.35, "share_<MONTH2>": 0.33, "share_TTL": 0.34,
      "curr_<MONTH1>": 1234, "curr_<MONTH2>": 2345, "curr_TTL": 5678,
      "wow_pct": 0.05,
      "prev_<MONTH1>": 1200, "prev_<MONTH2>": 2300, "prev_TTL": 5400,
      "wow_<MONTH1>": 0.03, "wow_<MONTH2>": -0.01,
      "prev_share": 0.33
    }, ...
  ],
  "triptype_detail": [
    {
      "airline": "CA",
      "abs_DI": 1234, "abs_II": 567, "abs_P2P": 89, "abs_TTL": 1890,
      "mkt_DI": 0.35, "mkt_II": 0.25, "mkt_P2P": 0.15, "mkt_TTL": 0.30,
      "own_DI": 0.65, "own_II": 0.30, "own_P2P": 0.05
    }, ...
  ]
}

CRITICAL RULES:
- Use the ACTUAL month names from the headers (e.g. share_MAY, curr_JUNE, etc.) — they vary by data period.
- Copy ALL numbers EXACTLY as they appear. Do NOT calculate or round.
- Share/percentage values stay as decimals (0.35 not 35).
- Integer passenger counts stay as integers.
- If a cell is empty or contains an error like #DIV/0!, use 0 for integers and 0 for floats, null for wow_<MONTH> fields.
- Rename "TTL"/"Grand Total" airline to "TOTAL".
"""

SHEET_PROMPTS['all_agents'] = """You are parsing an airline booking agent Excel sheet called "ALL AGTS".

This is a simple matrix: booking agents (rows) × airlines (columns), showing passenger counts.

Structure:
- Header row contains: "Row Labels", then airline codes (CA, CZ, MU, HU, etc.), then "Grand Total"
- Data rows: agent name, then passenger count per airline, then total
- Last row is "Grand Total"

Return JSON:
{
  "airlines": ["CA", "CZ", "MU", ...],
  "agents": [
    {"agent": "AGENT NAME", "CA": 100, "CZ": 50, ..., "total": 250},
    ...
  ]
}

RULES:
- Copy ALL numbers exactly. Do NOT calculate.
- Do NOT include the "Grand Total" row in agents array.
- List airlines in the same order as the header.
"""

SHEET_PROMPTS['top30_od'] = """You are parsing an airline OD (origin-destination) pair Excel sheet called "TOP 30 OD - ALL".

This sheet has TWO side-by-side tables:

## Left table: CA Top ODs
- Two columns: OD pair code (e.g. "LHRPEK") and passenger count
- Only shows Air China (CA) data

## Right table: All Airlines OD Comparison
- Header row with "Row Labels", then airline codes (CA, MU, CZ, etc.), then "Grand Total"
- Data rows: OD pair code, passenger count per airline, total

Return JSON:
{
  "ca_ods": [{"od": "LHRPEK", "pax": 1234}, ...],
  "all_airlines": ["CA", "MU", "CZ", ...],
  "all_ods": [
    {"od": "LHRPEK", "CA": 500, "MU": 300, ..., "total": 1200},
    ...
  ]
}

RULES:
- Copy ALL numbers exactly.
- Do NOT include "Grand Total" rows.
- OD codes are 6 characters (3-letter airport codes concatenated, e.g. LHRPEK = London Heathrow to Beijing).
- List airlines in the same order as the header.
"""

SHEET_PROMPTS['channel'] = """You are parsing an airline sales channel Excel sheet (CONSOL, OTA, or TMC).

These sheets show how different booking channels/agents perform across airlines.
The sheet contains multiple SECTIONS laid out horizontally or vertically. Each section has:
- A title/header like "Present Week", "Weekly Comparison", "Weekly Share", etc.
- An "Agents" (or TMC company name) header row with airline codes
- Data rows with agent/company names and values

## Sections to extract:

### share (Market Share %)
Values are decimals 0-1 representing percentages. Multiply by 100 for the output.
Each row: agent name + share value per airline.

### present (Present Week Absolute)
Integer passenger counts for the current week.
Each row: agent name + pax count per airline + total.

### weekly_comparison (Weekly Comparison)
Two sets of airline columns side by side: current week and last week.
Each row: agent name + current week values per airline + total + last week values per airline.

### airline_summary (only for CONSOL sheet)
A small table showing airline × trip type breakdown (D+I, I+I, P2P, total).

For TMC sheets, the key name is "tmc" instead of "agent".

Return JSON based on sheet type:

For CONSOL:
{
  "share": [{"agent": "NAME", "CA": 35.0, "MU": 20.0, ...}, ...],
  "present": [{"agent": "NAME", "CA": 100, "MU": 50, ..., "total": 200}, ...],
  "weekly_comparison": [{"agent": "NAME", "CA_curr": 100, "MU_curr": 50, ..., "total_curr": 200, "CA_last": 90, "MU_last": 45, ...}, ...],
  "airline_summary": [{"airline": "CA", "D+I": 100, "I+I": 50, "P2P": 10, "total": 160}, ...]
}

For OTA:
{
  "airlines": ["CA", "MU", ...],
  "share": [{"agent": "NAME", "CA": 35.0, ...}, ...],
  "present": [{"agent": "NAME", "CA": 100, ..., "total": 200}, ...],
  "weekly_comparison": [{"agent": "NAME", "CA_curr": 100, ..., "total_curr": 200, "CA_last": 90, ...}, ...],
  "weekly_share": [{"agent": "NAME", "CA": 35.0, ...}, ...]
}

For TMC:
{
  "airlines": ["CA", "BA", "MU", ...],
  "present": [{"tmc": "NAME", "CA": 100, ..., "total": 200}, ...],
  "share": [{"tmc": "NAME", "CA": 35.0, ...}, ...],
  "weekly_comparison": [{"tmc": "NAME", "CA": 100, ..., "total": 200}, ...]
}

CRITICAL RULES:
- Share values: multiply the raw decimal by 100 (e.g. 0.35 in cell → 35.0 in JSON).
- Passenger counts: copy as integers exactly.
- Rename "Total"/"Grand Total" agent to "TOTAL".
- Skip rows that are section headers/labels (like "Weekly Share", "Current Week Share", "Present Week", etc.)
- Stop reading data rows when you hit "Total" or "Grand Total" row.
- If a section is not found, use empty array [].
"""

SHEET_PROMPTS['trip_com'] = """You are parsing a Trip.com airline booking Excel sheet.

This shows passenger counts by POO (Point of Origin) country × airline.

Structure:
- Header row: "Row Labels", then airline codes (CA, MU, CZ, etc.), then "Grand Total"
- Data rows: country name, passenger count per airline, total
- Last data row is "Grand Total"

Return JSON:
{
  "airlines": ["CA", "MU", "CZ", ...],
  "countries": [
    {"country": "United Kingdom", "CA": 100, "MU": 50, ..., "total": 200},
    ...
  ]
}

RULES:
- Copy ALL numbers exactly.
- Rename "Grand Total" country row to "TOTAL" and include it.
- List airlines in the same order as the header.
"""


def ai_parse_sheet(grid, sheet_type, api_key, channel_name=None):
    """Use Gemini to parse a sheet grid into structured JSON."""
    grid_text = grid_to_text(grid)

    if sheet_type == 'channel':
        prompt = SHEET_PROMPTS['channel']
        prompt = f"Sheet name: {channel_name}\n\n{prompt}"
    else:
        prompt = SHEET_PROMPTS[sheet_type]

    full_prompt = f"""{prompt}

Here is the raw sheet data (tab-separated, R0 = first row):

{grid_text}

Return ONLY valid JSON matching the schema above. No explanation."""

    print(f"      Calling Gemini ({len(grid_text)} chars)...", flush=True)
    t0 = time.time()
    response_text = call_gemini(full_prompt, api_key)
    print(f"      Gemini responded in {time.time()-t0:.1f}s", flush=True)

    try:
        data = json.loads(response_text)
    except json.JSONDecodeError as e:
        # Try to extract JSON from markdown code block
        m = re.search(r'```(?:json)?\s*([\s\S]*?)```', response_text)
        if m:
            data = json.loads(m.group(1))
        else:
            raise ValueError(f"Failed to parse Gemini response as JSON: {e}\nResponse: {response_text[:500]}")

    return data


# ─── City/Country Aggregation (deterministic, not AI) ───

AIRPORT_TO_CITY = {
    'LHR': 'London', 'LGW': 'London', 'STN': 'London', 'LTN': 'London',
    'MAN': 'Manchester', 'EDI': 'Edinburgh',
    'PEK': 'Beijing', 'PKX': 'Beijing',
    'PVG': 'Shanghai', 'SHA': 'Shanghai',
    'CAN': 'Guangzhou', 'SZX': 'Shenzhen',
    'CTU': 'Chengdu', 'TFU': 'Chengdu',
    'HGH': 'Hangzhou', 'NKG': 'Nanjing',
    'XIY': "Xi'an", 'WUH': 'Wuhan',
    'CGO': 'Zhengzhou', 'CSX': 'Changsha',
    'TAO': 'Qingdao', 'FOC': 'Fuzhou',
    'SHE': 'Shenyang', 'KMG': 'Kunming',
    'CKG': 'Chongqing',
    'HKG': 'Hong Kong', 'NRT': 'Tokyo', 'HND': 'Tokyo',
    'KIX': 'Osaka', 'ICN': 'Seoul',
    'BKK': 'Bangkok', 'MNL': 'Manila',
    'SIN': 'Singapore', 'KUL': 'Kuala Lumpur',
    'SYD': 'Sydney', 'MEL': 'Melbourne', 'AKL': 'Auckland',
    'TPE': 'Taipei', 'SGN': 'Ho Chi Minh',
    'CNX': 'Chiang Mai', 'UBN': 'Ulaanbaatar',
}

CITY_TO_COUNTRY = {
    'London': 'UK', 'Manchester': 'UK', 'Edinburgh': 'UK',
    'Beijing': 'China', 'Shanghai': 'China', 'Guangzhou': 'China',
    'Shenzhen': 'China', 'Chengdu': 'China', 'Hangzhou': 'China',
    'Nanjing': 'China', "Xi'an": 'China', 'Wuhan': 'China',
    'Zhengzhou': 'China', 'Changsha': 'China', 'Qingdao': 'China',
    'Fuzhou': 'China', 'Shenyang': 'China', 'Kunming': 'China',
    'Chongqing': 'China',
    'Hong Kong': 'HK/Other', 'Tokyo': 'Japan', 'Osaka': 'Japan',
    'Seoul': 'Korea', 'Bangkok': 'Thailand', 'Manila': 'Philippines',
    'Singapore': 'Singapore', 'Kuala Lumpur': 'Malaysia',
    'Sydney': 'Australia', 'Melbourne': 'Australia', 'Auckland': 'New Zealand',
    'Taipei': 'Taiwan', 'Ho Chi Minh': 'Vietnam',
    'Chiang Mai': 'Thailand', 'Ulaanbaatar': 'Mongolia',
}


def aggregate_od_pairs(all_ods, all_airlines):
    """Aggregate airport OD pairs into city pairs and country pairs."""
    def get_city(apt):
        return AIRPORT_TO_CITY.get(apt, apt)

    # City pair aggregation
    city_pair_map = {}
    for od in all_ods:
        code = od['od']
        if len(code) < 6:
            continue
        orig_apt, dest_apt = code[:3], code[3:]
        orig_city, dest_city = get_city(orig_apt), get_city(dest_apt)
        cpkey = f'{orig_city} → {dest_city}'

        if cpkey not in city_pair_map:
            city_pair_map[cpkey] = {al: 0 for al in all_airlines}
            city_pair_map[cpkey]['total'] = 0
            city_pair_map[cpkey]['city_pair'] = cpkey
            city_pair_map[cpkey]['airports'] = []

        for al in all_airlines:
            city_pair_map[cpkey][al] += od.get(al, 0)
        city_pair_map[cpkey]['total'] += od.get('total', 0)
        city_pair_map[cpkey]['airports'].append(code)

    city_pairs = sorted(city_pair_map.values(), key=lambda x: x['total'], reverse=True)

    # Country pair aggregation
    country_pair_map = {}
    for cp in city_pairs:
        pair = cp['city_pair']
        cities = pair.split(' → ')
        if len(cities) == 2:
            c1 = CITY_TO_COUNTRY.get(cities[0], 'Other')
            c2 = CITY_TO_COUNTRY.get(cities[1], 'Other')
            cpkey = f'{c1} → {c2}'
        else:
            cpkey = 'Other'

        if cpkey not in country_pair_map:
            country_pair_map[cpkey] = {al: 0 for al in all_airlines}
            country_pair_map[cpkey]['total'] = 0
            country_pair_map[cpkey]['country_pair'] = cpkey

        for al in all_airlines:
            country_pair_map[cpkey][al] += cp.get(al, 0)
        country_pair_map[cpkey]['total'] += cp.get('total', 0)

    country_pairs = sorted(country_pair_map.values(), key=lambda x: x['total'], reverse=True)

    return city_pairs, country_pairs


# ─── Sanity Check ───

def validate_parsed_data(sheets):
    """Run sanity checks on parsed data. Returns list of warnings."""
    warnings = []

    # month_share checks
    ms = sheets.get('month_share', {})
    if not ms.get('triptype'):
        warnings.append("⚠️ month_share: no triptype data")
    if not ms.get('share'):
        warnings.append("⚠️ month_share: no share data")
    else:
        airlines_in_share = [s['airline'] for s in ms['share']]
        if 'CA' not in airlines_in_share and 'TOTAL' not in airlines_in_share:
            warnings.append("⚠️ month_share: CA not found in share data")

    # all_agents checks
    aa = sheets.get('all_agents', {})
    if not aa.get('agents'):
        warnings.append("⚠️ all_agents: no agents found")
    elif len(aa['agents']) < 10:
        warnings.append(f"⚠️ all_agents: only {len(aa['agents'])} agents (expected 100+)")

    # top30_od checks
    od = sheets.get('top30_od', {})
    if not od.get('all_ods'):
        warnings.append("⚠️ top30_od: no OD data")

    # Channel checks
    for ch_name in ('consol', 'ota', 'tmc'):
        ch = sheets.get(ch_name, {})
        if not ch.get('present') and not ch.get('share'):
            warnings.append(f"⚠️ {ch_name}: no present or share data")

    # trip_com checks
    tc = sheets.get('trip_com', {})
    if not tc.get('countries'):
        warnings.append("⚠️ trip_com: no country data")

    return warnings


# ─── Raw grid export ───

RAW_SHEET_MAP = {
    'Month share - Pax': 'raw_month_share',
    'ALL AGTS':          'raw_all_agts',
    'TOP 30 OD - ALL':   'raw_top30_od_all',
    'CONSOL':            'raw_consol',
    'TOP 30 OD - OTA':   'raw_top30_od_ota',
    'OTA':               'raw_ota',
    'TMC':               'raw_tmc',
    'Trip.com':          'raw_trip_com',
}

# Sheet name → (parser_sheet_key, ai_type, channel_name_for_channel_type)
SHEET_PARSE_MAP = {
    'Month share - Pax': ('month_share', 'month_share', None),
    'ALL AGTS':          ('all_agents', 'all_agents', None),
    'TOP 30 OD - ALL':   ('top30_od', 'top30_od', None),
    'CONSOL':            ('consol', 'channel', 'CONSOL'),
    'OTA':               ('ota', 'channel', 'OTA'),
    'TMC':               ('tmc', 'channel', 'TMC'),
    'Trip.com':          ('trip_com', 'trip_com', None),
}


def parse_raw_grids(wb):
    """Read each Excel sheet into a raw 2D array (up to 200 rows x 50 cols)."""
    result = {}
    for sheet_name, safe_name in RAW_SHEET_MAP.items():
        if sheet_name not in wb.sheetnames:
            print(f"   [raw] Sheet '{sheet_name}' not found, skipping", flush=True)
            continue
        ws = wb[sheet_name]
        grid = read_sheet_as_grid(ws, max_row=200, max_col=50)
        grid = [[_serialize_cell(c) for c in row] for row in grid]
        while grid and all(c is None for c in grid[-1]):
            grid.pop()
        max_used_col = 0
        if grid:
            for row in grid:
                for ci in range(len(row) - 1, -1, -1):
                    if row[ci] is not None:
                        max_used_col = max(max_used_col, ci + 1)
                        break
            grid = [row[:max_used_col] for row in grid]
        result[safe_name] = grid
        print(f"   [raw] {safe_name}: {len(grid)} rows x {max_used_col} cols", flush=True)
    return result


# ─── Main ───

def parse_sheets(filepath, db_path=None, api_key=None):
    if db_path is None:
        db_path = DB_PATH
    if api_key is None:
        api_key = os.environ.get('GEMINI_API_KEY', '')

    if not api_key:
        print("ERROR: No Gemini API key provided.", flush=True)
        print("   Set GEMINI_API_KEY env var or pass --gemini-key <key>", flush=True)
        sys.exit(1)

    filepath = os.path.expanduser(filepath)
    snapshot = extract_snapshot_date(filepath)

    print(f"[1/4] Opening workbook (data_only)...", flush=True)
    t0 = time.time()
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    print(f"   Opened in {time.time()-t0:.1f}s", flush=True)

    # Read all sheet grids
    print(f"[2/4] Reading sheet grids...", flush=True)
    sheet_grids = {}
    for sheet_name in SHEET_PARSE_MAP:
        if sheet_name not in wb.sheetnames:
            print(f"   Sheet '{sheet_name}' not found, skipping", flush=True)
            continue
        ws = wb[sheet_name]
        max_row = 200 if sheet_name == 'ALL AGTS' else 120
        max_col = 55 if sheet_name in ('OTA', 'CONSOL') else 80
        grid = read_sheet_as_grid(ws, max_row=max_row, max_col=max_col)
        # Serialize for AI consumption
        grid = [[_serialize_cell(c) for c in row] for row in grid]
        # Trim
        while grid and all(c is None for c in grid[-1]):
            grid.pop()
        if grid:
            max_used = 0
            for row in grid:
                for ci in range(len(row) - 1, -1, -1):
                    if row[ci] is not None:
                        max_used = max(max_used, ci + 1)
                        break
            grid = [row[:max_used] for row in grid]
        sheet_grids[sheet_name] = grid
        print(f"   {sheet_name}: {len(grid)} rows x {max_used if grid else 0} cols", flush=True)

    # Parse raw grids for raw data tab
    print(f"   Parsing raw grids...", flush=True)
    raw_grids = parse_raw_grids(wb)
    wb.close()
    print(f"   All grids read in {time.time()-t0:.1f}s", flush=True)

    # AI parse each sheet (parallel)
    print(f"[3/4] AI parsing sheets via Gemini (parallel)...", flush=True)
    sheets = {}

    def _parse_one(sheet_name, key, ai_type, channel_name):
        print(f"   Parsing {sheet_name}...", flush=True)
        data = ai_parse_sheet(sheet_grids[sheet_name], ai_type, api_key, channel_name)
        print(f"   ✓ {sheet_name} parsed successfully", flush=True)
        return key, data

    tasks = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        for sheet_name, (key, ai_type, channel_name) in SHEET_PARSE_MAP.items():
            if sheet_name not in sheet_grids:
                sheets[key] = {}
                continue
            future = executor.submit(_parse_one, sheet_name, key, ai_type, channel_name)
            tasks[future] = (sheet_name, key)

        for future in as_completed(tasks):
            sheet_name, key = tasks[future]
            try:
                k, data = future.result()
                sheets[k] = data
            except Exception as e:
                print(f"   ✗ {sheet_name} failed: {e}", flush=True)
                sheets[key] = {}

    # Post-process: add city/country aggregation to top30_od
    if sheets.get('top30_od', {}).get('all_ods'):
        all_airlines = sheets['top30_od'].get('all_airlines', [])
        all_ods = sheets['top30_od']['all_ods']
        city_pairs, country_pairs = aggregate_od_pairs(all_ods, all_airlines)
        sheets['top30_od']['city_pairs'] = city_pairs
        sheets['top30_od']['country_pairs'] = country_pairs
        print(f"   ✓ OD aggregation: {len(city_pairs)} city pairs, {len(country_pairs)} country pairs", flush=True)

    # Validate
    warnings = validate_parsed_data(sheets)
    if warnings:
        print(f"\n   ⚠️ Validation warnings:", flush=True)
        for w in warnings:
            print(f"   {w}", flush=True)
    else:
        print(f"   ✓ All validation checks passed", flush=True)

    # Store in SQLite
    print(f"[4/4] Storing in SQLite...", flush=True)
    db_path_abs = os.path.abspath(db_path)
    os.makedirs(os.path.dirname(db_path_abs), exist_ok=True)
    conn = sqlite3.connect(db_path_abs)
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS sheet_data (
        snapshot_date TEXT,
        sheet_name TEXT,
        data_json TEXT,
        PRIMARY KEY (snapshot_date, sheet_name)
    )""")

    for name, data in sheets.items():
        c.execute("""INSERT OR REPLACE INTO sheet_data VALUES (?, ?, ?)""",
                  (snapshot, name, json.dumps(data, ensure_ascii=False)))

    for safe_name, grid in raw_grids.items():
        c.execute("""INSERT OR REPLACE INTO sheet_data VALUES (?, ?, ?)""",
                  (snapshot, safe_name, json.dumps(grid, ensure_ascii=False)))

    conn.commit()
    conn.close()

    print(f"\n   Done! Snapshot: {snapshot}", flush=True)
    print(f"   Total time: {time.time()-t0:.1f}s", flush=True)

    # Summary
    ms = sheets.get('month_share', {})
    print(f"\n   Sheet1 share data: {len(ms.get('share', []))} airlines", flush=True)
    print(f"   Sheet2 agents: {len(sheets.get('all_agents', {}).get('agents', []))}", flush=True)
    od = sheets.get('top30_od', {})
    print(f"   Sheet3 ODs: CA={len(od.get('ca_ods', []))}, ALL={len(od.get('all_ods', []))}", flush=True)
    print(f"   Sheet4 CONSOL: {len(sheets.get('consol', {}).get('present', []))} agents", flush=True)
    print(f"   Sheet6 OTA: {len(sheets.get('ota', {}).get('present', []))} agents", flush=True)
    print(f"   Sheet7 TMC: {len(sheets.get('tmc', {}).get('present', []))} TMCs", flush=True)
    print(f"   Sheet8 Trip.com: {len(sheets.get('trip_com', {}).get('countries', []))} countries", flush=True)

    return snapshot


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python sheet_parser.py <excel_file> [--db DB_PATH] [--gemini-key KEY]")
        sys.exit(1)

    db_path = None
    api_key = None

    if '--db' in sys.argv:
        idx = sys.argv.index('--db')
        if idx + 1 < len(sys.argv):
            db_path = sys.argv[idx + 1]
    if '--gemini-key' in sys.argv:
        idx = sys.argv.index('--gemini-key')
        if idx + 1 < len(sys.argv):
            api_key = sys.argv[idx + 1]

    if not db_path:
        db_path = os.environ.get('DB_PATH', DB_PATH)
    if not api_key:
        api_key = os.environ.get('GEMINI_API_KEY', '')

    parse_sheets(sys.argv[1], db_path=db_path, api_key=api_key)
