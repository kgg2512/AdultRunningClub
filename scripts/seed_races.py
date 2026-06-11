# ARC V3 — races 시드 변환 스크립트 (TECH_SPEC §7)
# 입력: docs/ARC_V3_PREP/races-seed-2026.json (G2 루트 — repo 외부)
# 출력: supabase/seed_races.sql (회장이 SQL Editor에서 실행)
# DEV-1: date null → race_date NULL 허용 (schema_v3.sql 동일 편차)
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve()
REPO = HERE.parents[1]                       # AdultRunningClub/
G2_ROOT = REPO.parent                        # G2 Company Ltd/
SRC = G2_ROOT / 'docs' / 'ARC_V3_PREP' / 'races-seed-2026.json'
OUT = REPO / 'supabase' / 'seed_races.sql'

if not SRC.exists():
    sys.exit(f"ERROR: seed json not found: {SRC}")


def q(v):  # SQL 문자열 이스케이프
    return 'NULL' if v in (None, '') else "'" + str(v).replace("'", "''") + "'"


def arr(xs):
    return 'ARRAY[' + ','.join(q(x) for x in xs) + ']::text[]' if xs else "'{}'::text[]"


data = json.loads(SRC.read_text(encoding='utf-8'))
rows = []
for r in data['races']:
    reg = r.get('registration') or {}
    status = reg.get('status') or 'unknown'
    if status not in ('open', 'closed', 'upcoming'):
        status = 'unknown'
    rows.append(f"({q(r['name'])},{q(r.get('date'))},{q(r['region'])},{q(r.get('venue'))},"
                f"{arr(r.get('courses') or [])},{q(reg.get('start'))},{q(reg.get('end'))},"
                f"{q(status)},{q(r.get('organizer'))},{q(r.get('official_url'))},"
                f"{q(r.get('confidence'))},{q(r.get('source_note'))})")

sql = ("-- 자동 생성: scripts/seed_races.py — 수동 편집 금지\n"
       "-- 갱신 절차: JSON 수정 → 재생성 → TRUNCATE public.races CASCADE; 후 재실행\n"
       "INSERT INTO public.races (name, race_date, region, venue, courses, reg_start, reg_end,"
       " reg_status, organizer, official_url, confidence, source_note)\nVALUES\n"
       + ",\n".join(rows) + ";\n")
OUT.write_text(sql, encoding='utf-8')
print(f"OK: {len(rows)} races -> {OUT}")
