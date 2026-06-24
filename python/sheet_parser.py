#!/usr/bin/env python3
"""
Parse pre-computed pivot table data from each Excel sheet.
Stores structured data matching what the user sees in Excel.
"""

import sys
import os
import re
import json

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
AIRLINES = ['CA', 'MU', 'CZ', 'HU', 'BA', 'HO', 'ZH', 'JD', 'GS', 'NZ']


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


# ─── Sheet 1: Month share - Pax ───

def parse_sheet1(wb):
    """Parse Month share - Pax sheet."""
    ws = wb['Month share - Pax']
    g = read_sheet_as_grid(ws)

    data = {}

    # Table 1: Airlines × Trip Types (rows 7-18, 0-indexed: 6-17)
    # Row 6: headers [Row Labels, D+I, I+I, 点点, Grand Total]
    triptype_data = []
    for r in range(7, 17):  # rows 8-17 (airlines)
        if r >= len(g) or not g[r][0]:
            continue
        airline = g[r][0]
        if airline == 'Grand Total':
            continue
        triptype_data.append({
            'airline': str(airline),
            'D+I': int(g[r][1] or 0),
            'I+I': int(g[r][2] or 0),
            'P2P': int(g[r][3] or 0),
            'total': int(g[r][4] or 0),
        })
    data['triptype'] = triptype_data
    # Grand total
    for r in range(7, 20):
        if r < len(g) and g[r][0] == 'Grand Total':
            data['triptype_total'] = {
                'D+I': int(g[r][1] or 0),
                'I+I': int(g[r][2] or 0),
                'P2P': int(g[r][3] or 0),
                'total': int(g[r][4] or 0),
            }
            break

    # Table 2: GREEN section (rows 26-35, 0-indexed: 25-34)
    # Row 25: headers
    # Cols F-L (5-11): SHARE by month MAY-OCT + TTL
    # Cols N-T (13-19): Current week JUNE-NOV + TTL (col 20)
    # Col V (21): Previous identifier
    # Col W (22): 总计环比
    # Cols X-AC (23-28): Previous week JUNE-NOV
    # Col AD (29): Previous TTL
    months_share = ['MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT']
    months_current = ['JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV']

    share_data = []
    for r in range(26, 35):  # rows 27-35
        if r >= len(g) or not g[r][5]:
            continue
        airline = str(g[r][5])
        if airline == 'TTL':
            airline = 'TOTAL'

        entry = {'airline': airline}

        # Monthly shares (cols 6-11)
        for mi, m in enumerate(months_share):
            val = g[r][6 + mi]
            entry[f'share_{m}'] = float(val) if val is not None else 0

        # Total share (col 12)
        entry['share_TTL'] = float(g[r][12]) if g[r][12] is not None else 0

        # Current week absolute (cols 14-19)
        for mi, m in enumerate(months_current):
            val = g[r][14 + mi]
            entry[f'curr_{m}'] = int(val) if val is not None else 0

        # Current total (col 20)
        entry['curr_TTL'] = int(g[r][20]) if g[r][20] is not None else 0

        # Previous total (col 29)
        prev_ttl = g[r][29] if len(g[r]) > 29 else None
        entry['prev_TTL'] = int(prev_ttl) if prev_ttl is not None else 0

        # WoW change (col 22)
        wow = g[r][22]
        entry['wow_pct'] = float(wow) if wow is not None and wow != '#DIV/0!' else 0

        # Previous week absolute (cols 23-28)
        for mi, m in enumerate(months_current):
            val = g[r][23 + mi] if len(g[r]) > 23 + mi else None
            entry[f'prev_{m}'] = int(val) if val is not None else 0

        # Monthly WoW changes (cols 30-35)
        for mi, m in enumerate(months_current):
            val = g[r][30 + mi] if len(g[r]) > 30 + mi else None
            if val is not None and val != '#DIV/0!':
                entry[f'wow_{m}'] = float(val)
            else:
                entry[f'wow_{m}'] = None

        # Previous share (col 37)
        prev_share = g[r][37] if len(g[r]) > 37 else None
        entry['prev_share'] = float(prev_share) if prev_share is not None else 0

        share_data.append(entry)

    data['share'] = share_data

    # Table 3: Bottom tables (rows 62-71, 0-indexed: 61-70)
    # Three sub-tables side by side:
    # Cols F-I (5-8): absolute D+I, I+I, P2P, TTL
    # Cols K-N (10-13): share within market (% of total per trip type)
    # Cols P-S (15-18): share within airline
    bottom_data = []
    for r in range(62, 71):
        if r >= len(g) or not g[r][5]:
            continue
        airline = str(g[r][5])
        if airline == 'Grand Total':
            airline = 'TOTAL'

        entry = {'airline': airline}

        # Absolute
        entry['abs_DI'] = int(g[r][6] or 0)
        entry['abs_II'] = int(g[r][7] or 0)
        entry['abs_P2P'] = int(g[r][8] or 0)
        entry['abs_TTL'] = int(g[r][9] or 0)

        # Share in market (% of column total)
        entry['mkt_DI'] = float(g[r][11]) if g[r][11] is not None else 0
        entry['mkt_II'] = float(g[r][12]) if g[r][12] is not None else 0
        entry['mkt_P2P'] = float(g[r][13]) if g[r][13] is not None else 0
        entry['mkt_TTL'] = float(g[r][14]) if g[r][14] is not None else 0

        # Share within airline (% of row total)
        entry['own_DI'] = float(g[r][16]) if g[r][16] is not None else 0
        entry['own_II'] = float(g[r][17]) if g[r][17] is not None else 0
        entry['own_P2P'] = float(g[r][18]) if g[r][18] is not None else 0

        bottom_data.append(entry)

    data['triptype_detail'] = bottom_data

    return data


# ─── Sheet 2: ALL AGTS ───

def parse_sheet2(wb):
    """Parse ALL AGTS sheet - agent × airline matrix."""
    ws = wb['ALL AGTS']
    g = read_sheet_as_grid(ws, max_row=200)

    # Row 8 (idx 8): headers [Row Labels, CA, CZ, MU, HU, HO, BA, ZH, JD, GS, NZ, Grand Total]
    # Find header row
    header_row = None
    for i, row in enumerate(g):
        if row and row[0] == 'Row Labels':
            header_row = i
            break

    if header_row is None:
        return []

    airlines = []
    for j in range(1, min(12, len(g[header_row]))):
        val = g[header_row][j]
        if val and val != 'Grand Total':
            airlines.append(str(val))

    agents = []
    for r in range(header_row + 1, len(g)):
        if not g[r] or not g[r][0]:
            continue
        name = str(g[r][0])
        if name == 'Grand Total':
            break

        entry = {'agent': name}
        total = 0
        for j, al in enumerate(airlines):
            val = g[r][1 + j]
            pax = int(val) if val is not None else 0
            entry[al] = pax
            total += pax

        gt = g[r][len(airlines) + 1]
        entry['total'] = int(gt) if gt is not None else total
        agents.append(entry)

    return {'airlines': airlines, 'agents': agents}


# ─── Sheet 3: TOP 30 OD - ALL ───

def parse_sheet3(wb):
    """Parse TOP 30 OD - ALL: CA top ODs + all airlines comparison."""
    ws = wb['TOP 30 OD - ALL']
    g = read_sheet_as_grid(ws, max_row=45)

    # Left table: CA top ODs (cols A-B, rows 9-38)
    ca_ods = []
    for r in range(8, 40):
        if r >= len(g) or not g[r][0] or g[r][0] == 'Grand Total':
            break
        ca_ods.append({'od': str(g[r][0]), 'pax': int(g[r][1] or 0)})

    # Right table: All airlines (cols E-P, rows 9-38)
    # Row 7 (idx 7): headers
    all_airlines = []
    if len(g) > 7:
        for j in range(5, 16):
            if j < len(g[7]) and g[7][j] and g[7][j] not in ('Row Labels', 'Grand Total'):
                all_airlines.append(str(g[7][j]))

    all_ods = []
    for r in range(8, 40):
        if r >= len(g) or not g[r][4] or g[r][4] == 'Grand Total':
            break
        entry = {'od': str(g[r][4])}
        for j, al in enumerate(all_airlines):
            val = g[r][5 + j]
            entry[al] = int(val) if val is not None else 0
        gt = g[r][5 + len(all_airlines)]
        entry['total'] = int(gt) if gt is not None else 0
        all_ods.append(entry)

    # ─── Aggregate to city pairs and country pairs ───
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

    def get_city(apt):
        return AIRPORT_TO_CITY.get(apt, apt)

    def make_pair_key(orig, dest):
        """UK is always origin in this sheet, so keep direction."""
        return f'{orig} → {dest}'

    # City pair aggregation
    city_pair_map = {}
    for od in all_ods:
        code = od['od']
        orig_apt, dest_apt = code[:3], code[3:]
        orig_city, dest_city = get_city(orig_apt), get_city(dest_apt)
        cpkey = make_pair_key(orig_city, dest_city)

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
            cpkey = make_pair_key(c1, c2)
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

    return {
        'ca_ods': ca_ods,
        'all_airlines': all_airlines,
        'all_ods': all_ods,
        'city_pairs': city_pairs,
        'country_pairs': country_pairs,
    }


# ─── Sheet 4: CONSOL ───

def parse_sheet4(wb):
    """Parse CONSOL sheet."""
    ws = wb['CONSOL']
    g = read_sheet_as_grid(ws, max_row=65, max_col=40)

    # Percentage table (right side, cols P-Y, rows 4-10)
    # Row 2 (idx 2): header row with agent names
    share_data = []
    for r in range(3, 11):
        if r >= len(g) or not g[r][15]:
            continue
        agent = str(g[r][15])
        if agent in ('Grand Total', 'Agents'):
            agent = 'TOTAL' if agent == 'Grand Total' else agent
            if agent == 'Agents':
                continue
        entry = {'agent': agent}
        for j, al in enumerate(AIRLINES[:9]):  # CA,MU,CZ,HU,ZH,HO,JD,GS,BA
            val = g[r][16 + j]
            entry[al] = float(val) * 100 if val is not None and isinstance(val, (int, float)) else 0
        share_data.append(entry)

    # Present week absolute (rows 14-21, cols P-Z)
    present_data = []
    for r in range(14, 22):
        if r >= len(g) or not g[r][15]:
            continue
        agent = str(g[r][15])
        if agent in ('Grand Total', 'Agents'):
            if agent == 'Agents':
                continue
            agent = 'TOTAL'
        entry = {'agent': agent}
        for j, al in enumerate(AIRLINES[:9] + ['total']):
            col = 16 + j
            val = g[r][col] if col < len(g[r]) else None
            entry[al if al != 'total' else 'total'] = int(val) if val is not None else 0
        present_data.append(entry)

    # Weekly Comparison: rows 27-34 (0-idx: 26-33), cols P-Z
    # Row 26: header ["Weekly Comparison", "Present Week", ...]
    # Row 27: ["Agents", "CA", "MU", "CZ", "HU", "ZH", "HO", "JD", "GS", "BA", "Grand Total", "Agents", "CA", "MU", "CZ", ...]
    # Row 28+: agent data, present week cols 16-24, total col 25, last week cols 27-35
    consol_airlines = ['CA', 'MU', 'CZ', 'HU', 'ZH', 'HO', 'JD', 'GS', 'BA']
    weekly_comparison = []
    for r in range(27, 35):
        if r >= len(g) or not g[r][15]:
            continue
        agent = str(g[r][15])
        if agent in ('Agents', 'Row Labels', 'Weekly Comparison'):
            continue
        if agent == 'Grand Total':
            agent = 'TOTAL'
        entry = {'agent': agent}
        # Present week: cols 16-24 (CA,MU,CZ,HU,ZH,HO,JD,GS,BA)
        for j, al in enumerate(consol_airlines):
            val = g[r][16 + j] if len(g[r]) > 16 + j else None
            entry[f'{al}_curr'] = int(val) if val is not None and isinstance(val, (int, float)) else 0
        # Present total: col 25
        val_total = g[r][25] if len(g[r]) > 25 else None
        entry['total_curr'] = int(val_total) if val_total is not None and isinstance(val_total, (int, float)) else 0
        # Last week: cols 27-35 (skip col 26 = agent name repeat)
        for j, al in enumerate(consol_airlines):
            val = g[r][27 + j] if len(g[r]) > 27 + j else None
            entry[f'{al}_last'] = int(val) if val is not None and isinstance(val, (int, float)) else 0
        weekly_comparison.append(entry)

    # Airline summary: rows 50-60 cols P-W (0-idx: 49-59, cols 15-22)
    # Cols: airline(15), ytd(16), share(17), current(18), past(19), share_curr(20), share_past(21), share_growth(22)
    airline_summary = []
    for r in range(49, 62):
        if r >= len(g) or not g[r][15]:
            continue
        airline = str(g[r][15])
        if airline in ('Row Labels', 'Airline', 'Dom OP Airlines'):
            continue
        if airline == 'Grand Total':
            airline = 'TOTAL'
        entry = {'airline': airline}
        # Cols: 16=YTD, 17=YTD_share, 18=current_pax, 19=current_share, 20=past_pax, 21=past_share, 22=share_growth
        ytd = g[r][16] if len(g[r]) > 16 else None
        # Skip header rows where ytd is text
        if isinstance(ytd, str) and not ytd.replace('-','').isdigit():
            continue
        ytd_share = g[r][17] if len(g[r]) > 17 else None
        current = g[r][18] if len(g[r]) > 18 else None
        curr_share = g[r][19] if len(g[r]) > 19 else None
        past = g[r][20] if len(g[r]) > 20 else None
        past_share = g[r][21] if len(g[r]) > 21 else None
        share_growth = g[r][22] if len(g[r]) > 22 else None
        entry['ytd'] = int(ytd) if ytd is not None and isinstance(ytd, (int, float)) else 0
        entry['ytd_share'] = float(ytd_share) if ytd_share is not None and isinstance(ytd_share, (int, float)) else 0
        entry['current'] = int(current) if current is not None and isinstance(current, (int, float)) else 0
        entry['current_share'] = float(curr_share) if curr_share is not None and isinstance(curr_share, (int, float)) else 0
        entry['past'] = int(past) if past is not None and isinstance(past, (int, float)) else 0
        entry['past_share'] = float(past_share) if past_share is not None and isinstance(past_share, (int, float)) else 0
        entry['share_growth'] = float(share_growth) if share_growth is not None and isinstance(share_growth, (int, float)) else 0
        airline_summary.append(entry)

    return {
        'share': share_data,
        'present': present_data,
        'weekly_comparison': weekly_comparison,
        'airline_summary': airline_summary,
    }


# ─── Sheet 6: OTA ───

def parse_sheet6(wb):
    """Parse OTA sheet - agent × airline with shares."""
    ws = wb['OTA']
    g = read_sheet_as_grid(ws, max_row=85, max_col=45)

    # Share table (right side, cols AC-AI, rows 5-12)
    ota_airlines = ['CA', 'MU', 'CZ', 'HU', 'ZH', 'HO']
    share_data = []
    for r in range(4, 12):
        if r >= len(g) or not g[r][28]:
            continue
        agent = str(g[r][28])
        if agent in ('Agents', 'Total'):
            continue
        entry = {'agent': agent}
        for j, al in enumerate(ota_airlines):
            val = g[r][29 + j]
            entry[al] = float(val) * 100 if val is not None and isinstance(val, (int, float)) else 0
        share_data.append(entry)

    # Present week absolute (rows 18-26, cols AC-AI)
    present_data = []
    for r in range(17, 27):
        if r >= len(g) or not g[r][28]:
            continue
        agent = str(g[r][28])
        if agent == 'Agents':
            continue
        entry = {'agent': agent}
        for j, al in enumerate(ota_airlines):
            val = g[r][29 + j]
            entry[al] = int(val) if val is not None else 0
        # Total
        total_cols = [entry.get(al, 0) for al in ota_airlines]
        entry['total'] = sum(total_cols)
        present_data.append(entry)

    # Weekly comparison: rows 29-37 (0-idx: 28-36)
    # Row 29 header: Agents, CA, MU, CZ, HU, ZH, HO, JD, GS, BA, Total, CA(last), MU(last), CZ(last)...
    # 9 airlines present (cols 29-37), Total (col 38), then 9 airlines last week (cols 39-47)
    ota_airlines_full = ['CA', 'MU', 'CZ', 'HU', 'ZH', 'HO', 'JD', 'GS', 'BA']
    weekly_comparison = []
    for r in range(29, 38):
        if r >= len(g) or not g[r][28]:
            continue
        agent = str(g[r][28])
        if agent in ('Agents', 'Row Labels', 'Weekly Comparison'):
            continue
        if agent == 'Total':
            agent = 'TOTAL'
        entry = {'agent': agent}
        # Present week: 9 airlines cols 29-37
        for j, al in enumerate(ota_airlines_full):
            val = g[r][29 + j] if len(g[r]) > 29 + j else None
            entry[f'{al}_curr'] = int(val) if val is not None and isinstance(val, (int, float)) else 0
        # Present total: col 38
        val_total = g[r][38] if len(g[r]) > 38 else None
        entry['total_curr'] = int(val_total) if val_total is not None and isinstance(val_total, (int, float)) else 0
        # Last week: 9 airlines cols 39-47 (col 39 = agent name repeat, so skip; actual data starts at 40)
        # Actually checking: col 39 has "E-TRAVEL AE"(agent repeat) or a number?
        # From raw data: col 39=468(CA_last) — no agent repeat here, directly numbers
        for j, al in enumerate(ota_airlines_full):
            val = g[r][39 + j] if len(g[r]) > 39 + j else None
            entry[f'{al}_last'] = int(val) if val is not None and isinstance(val, (int, float)) else 0
        weekly_comparison.append(entry)

    # Weekly share: rows 40-48 cols AC-AK (0-idx: 39-47, cols 28-36)
    # % per agent per airline this week vs last week
    weekly_share_curr = []
    for r in range(39, 49):
        if r >= len(g) or not g[r][28]:
            continue
        agent = str(g[r][28])
        if agent in ('Agents', 'Row Labels'):
            continue
        if agent == 'Total':
            agent = 'TOTAL'
        entry = {'agent': agent}
        for j, al in enumerate(ota_airlines):
            val = g[r][29 + j]
            entry[al] = float(val) * 100 if val is not None and isinstance(val, (int, float)) else 0
        weekly_share_curr.append(entry)

    # Growth weekly: row 49 cols AC-AK (0-idx: 48)
    growth_weekly = {}
    r = 48
    if r < len(g) and g[r][28]:
        label = str(g[r][28])
        growth_weekly['label'] = label
        for j, al in enumerate(ota_airlines):
            val = g[r][29 + j]
            growth_weekly[al] = float(val) * 100 if val is not None and isinstance(val, (int, float)) else 0

    # Airline summary by trip type (left side pivot): row ~75 Grand Total D+I/I+I/P2P
    # Scan rows 70-80 for Grand Total row with trip type breakdown
    airline_summary = []
    for r in range(69, 85):
        if r >= len(g) or not g[r][0]:
            continue
        airline = str(g[r][0])
        if airline in ('Row Labels', ''):
            continue
        entry = {'airline': airline}
        di = g[r][1] if len(g[r]) > 1 else None
        ii = g[r][2] if len(g[r]) > 2 else None
        p2p = g[r][3] if len(g[r]) > 3 else None
        total = g[r][4] if len(g[r]) > 4 else None
        entry['D+I'] = int(di) if di is not None else 0
        entry['I+I'] = int(ii) if ii is not None else 0
        entry['P2P'] = int(p2p) if p2p is not None else 0
        entry['total'] = int(total) if total is not None else 0
        airline_summary.append(entry)

    return {
        'airlines': ota_airlines,
        'share': share_data,
        'present': present_data,
        'weekly_comparison': weekly_comparison,
        'weekly_share': weekly_share_curr,
        'growth_weekly': growth_weekly,
        'airline_summary': airline_summary,
    }


# ─── Sheet 7: TMC ───

def parse_sheet7(wb):
    """Parse TMC sheet."""
    ws = wb['TMC']
    g = read_sheet_as_grid(ws, max_row=75, max_col=40)

    tmc_airlines = ['CA', 'BA', 'MU', 'CZ', 'HU', 'ZH', 'HO', 'GS']

    # Present week absolute (right side, rows 10-26, cols R-Z)
    present_data = []
    for r in range(9, 27):
        if r >= len(g) or not g[r][17]:
            continue
        tmc = str(g[r][17])
        if tmc in ('PRESENT WEEK', 'Grand Total'):
            if tmc == 'Grand Total':
                tmc = 'TOTAL'
            else:
                continue
        entry = {'tmc': tmc}
        for j, al in enumerate(tmc_airlines):
            val = g[r][18 + j]
            entry[al] = int(val) if val is not None else 0
        gt = g[r][26] if len(g[r]) > 26 else None
        entry['total'] = int(gt) if gt is not None else sum(entry.get(al, 0) for al in tmc_airlines)
        present_data.append(entry)

    # Share table (rows 30-42, cols R-Y)
    share_data = []
    for r in range(29, 43):
        if r >= len(g) or not g[r][17]:
            continue
        tmc = str(g[r][17])
        if tmc in ('PRESENT WEEK', 'Grand Total'):
            continue
        entry = {'tmc': tmc}
        for j, al in enumerate(tmc_airlines):
            val = g[r][18 + j]
            entry[al] = float(val) * 100 if val is not None and isinstance(val, (int, float)) else 0
        share_data.append(entry)

    # Current week per TMC: rows 49-60+ cols R-Z (0-idx: 48-60+, cols 17-25)
    # Separate weekly breakdown section
    weekly_comparison = []
    for r in range(48, 68):
        if r >= len(g) or not g[r][17]:
            continue
        tmc = str(g[r][17])
        if tmc in ('PRESENT WEEK', 'PREVIOUS', 'CURRENT WEEK', 'Row Labels', 'TMC'):
            continue
        # Skip header rows where next cell is a string (airline name)
        next_val = g[r][18] if len(g[r]) > 18 else None
        if isinstance(next_val, str):
            continue
        if tmc == 'Grand Total':
            tmc = 'TOTAL'
        entry = {'tmc': tmc}
        for j, al in enumerate(tmc_airlines):
            col = 18 + j
            val = g[r][col] if col < len(g[r]) else None
            entry[al] = int(val) if val is not None and isinstance(val, (int, float)) else 0
        gt_col = 18 + len(tmc_airlines)
        gt = g[r][gt_col] if gt_col < len(g[r]) else None
        entry['total'] = int(gt) if gt is not None else sum(entry.get(al, 0) for al in tmc_airlines)
        weekly_comparison.append(entry)

    return {
        'airlines': tmc_airlines,
        'present': present_data,
        'share': share_data,
        'weekly_comparison': weekly_comparison,
    }


# ─── Sheet 8: Trip.com ───

def parse_sheet8(wb):
    """Parse Trip.com sheet - by POO country."""
    ws = wb['Trip.com']
    g = read_sheet_as_grid(ws, max_row=40)

    # Row 5 (idx 5): headers [Row Labels, CA, MU, CZ, HU, HO, ZH, GS, JD, BA, Grand Total]
    trip_airlines = ['CA', 'MU', 'CZ', 'HU', 'HO', 'ZH', 'GS', 'JD', 'BA']

    countries = []
    for r in range(6, 35):
        if r >= len(g) or not g[r][0]:
            continue
        country = str(g[r][0])
        if country == 'Grand Total':
            country = 'TOTAL'
        entry = {'country': country}
        for j, al in enumerate(trip_airlines):
            val = g[r][1 + j]
            entry[al] = int(val) if val is not None else 0
        gt = g[r][10] if len(g[r]) > 10 else None
        entry['total'] = int(gt) if gt is not None else 0
        countries.append(entry)

    return {'airlines': trip_airlines, 'countries': countries}


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


def _serialize_cell(v):
    """Convert a cell value to something JSON-safe."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    return str(v)


def parse_raw_grids(wb):
    """Read each Excel sheet into a raw 2D array (up to 200 rows x 50 cols).
    Returns dict mapping safe_name -> grid (list of lists).
    """
    result = {}
    for sheet_name, safe_name in RAW_SHEET_MAP.items():
        if sheet_name not in wb.sheetnames:
            print(f"   [raw] Sheet '{sheet_name}' not found, skipping", flush=True)
            continue
        ws = wb[sheet_name]
        grid = read_sheet_as_grid(ws, max_row=200, max_col=50)
        # Convert all cells to JSON-safe values
        grid = [[_serialize_cell(c) for c in row] for row in grid]
        # Trim trailing all-None rows
        while grid and all(c is None for c in grid[-1]):
            grid.pop()
        # Trim trailing None cols from each row
        if grid:
            max_used_col = 0
            for row in grid:
                for ci in range(len(row) - 1, -1, -1):
                    if row[ci] is not None:
                        max_used_col = max(max_used_col, ci + 1)
                        break
            grid = [row[:max_used_col] for row in grid]
        result[safe_name] = grid
        print(f"   [raw] {safe_name}: {len(grid)} rows x {max_used_col if grid else 0} cols", flush=True)
    return result


# ─── Main ───

def parse_sheets(filepath, db_path=None):
    if db_path is None:
        db_path = DB_PATH

    filepath = os.path.expanduser(filepath)
    snapshot = extract_snapshot_date(filepath)

    print(f"[1/3] Opening workbook (data_only)...", flush=True)
    t0 = time.time()
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    print(f"   Opened in {time.time()-t0:.1f}s", flush=True)

    print(f"[2/3] Parsing sheets...", flush=True)

    sheet1 = parse_sheet1(wb)
    sheet2 = parse_sheet2(wb)
    sheet3 = parse_sheet3(wb)
    sheet4 = parse_sheet4(wb)
    sheet6 = parse_sheet6(wb)
    sheet7 = parse_sheet7(wb)
    sheet8 = parse_sheet8(wb)

    print(f"   Parsing raw grids...", flush=True)
    raw_grids = parse_raw_grids(wb)

    wb.close()
    print(f"   All sheets parsed in {time.time()-t0:.1f}s", flush=True)

    # Store as JSON in SQLite
    print(f"[3/3] Storing in SQLite...", flush=True)
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

    sheets = {
        'month_share': sheet1,
        'all_agents': sheet2,
        'top30_od': sheet3,
        'consol': sheet4,
        'ota': sheet6,
        'tmc': sheet7,
        'trip_com': sheet8,
    }

    for name, data in sheets.items():
        c.execute("""INSERT OR REPLACE INTO sheet_data VALUES (?, ?, ?)""",
                  (snapshot, name, json.dumps(data, ensure_ascii=False)))

    # Store raw grids
    for safe_name, grid in raw_grids.items():
        c.execute("""INSERT OR REPLACE INTO sheet_data VALUES (?, ?, ?)""",
                  (snapshot, safe_name, json.dumps(grid, ensure_ascii=False)))

    conn.commit()
    conn.close()

    print(f"   Done! Snapshot: {snapshot}", flush=True)
    print(f"   Sheets stored: {list(sheets.keys())}", flush=True)
    print(f"   Total time: {time.time()-t0:.1f}s", flush=True)

    # Print summary
    print(f"\n   Sheet1 share data: {len(sheet1.get('share', []))} airlines", flush=True)
    print(f"   Sheet2 agents: {len(sheet2.get('agents', []))}", flush=True)
    print(f"   Sheet3 ODs: CA={len(sheet3.get('ca_ods', []))}, ALL={len(sheet3.get('all_ods', []))}", flush=True)
    print(f"   Sheet4 CONSOL: {len(sheet4.get('present', []))} agents", flush=True)
    print(f"   Sheet6 OTA: {len(sheet6.get('present', []))} agents", flush=True)
    print(f"   Sheet7 TMC: {len(sheet7.get('present', []))} TMCs", flush=True)
    print(f"   Sheet8 Trip.com: {len(sheet8.get('countries', []))} countries", flush=True)

    return snapshot


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python sheet_parser.py <excel_file> [--db DB_PATH]")
        sys.exit(1)
    db_path = None
    if '--db' in sys.argv:
        idx = sys.argv.index('--db')
        if idx + 1 < len(sys.argv):
            db_path = sys.argv[idx + 1]
    if not db_path:
        db_path = os.environ.get('DB_PATH', DB_PATH)
    parse_sheets(sys.argv[1], db_path=db_path)
