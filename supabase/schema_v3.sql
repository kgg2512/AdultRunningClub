-- ============================================================
-- ARC V3 — Supabase Schema (Phase 1)
-- CISO SEC-01~12 / CLO 동의구조 / CFO $0 제약 반영
-- 실행: Supabase Dashboard → SQL Editor → 전체 실행
--
-- ⚠️ 스펙 편차 DEV-1 (CTO 승인 2026-06-11):
--   races.race_date: NOT NULL → NULL 허용.
--   사유: 시드 43건 중 19건이 일정 미발표(date null) — 코드 집계 확인.
--   NULL = "일정 미정" 대회. get_race_board는 NULLS LAST 정렬 + NULL 포함 반환.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 공통: updated_at 트리거 ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

-- ── 1. users_profile (V3 — 실명·소속·생년월일 확장) ─────────
CREATE TABLE public.users_profile (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 40),
  organization TEXT NOT NULL CHECK (char_length(organization) BETWEEN 1 AND 60),
  birth_date   DATE NOT NULL,
  cohort       TEXT,                          -- 예: 'KWC-1'
  bio          TEXT CHECK (bio IS NULL OR char_length(bio) <= 300),
  profile_visibility TEXT NOT NULL DEFAULT 'members'
               CHECK (profile_visibility IN ('members','hidden')),   -- SEC-06
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER users_profile_updated_at BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 만 18세 미만 차단 (CLO 필수 — CHECK 대신 트리거: CURRENT_DATE 의존)
CREATE OR REPLACE FUNCTION public.check_adult()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'UNDERAGE: 만 18세 이상만 가입할 수 있습니다';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_profile_adult_check
  BEFORE INSERT OR UPDATE OF birth_date ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.check_adult();

-- 가입 시 프로필 자동 생성 (signUp metadata 사용)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users_profile (user_id, email, full_name, organization, birth_date, cohort)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '미입력'),
    COALESCE(NEW.raw_user_meta_data->>'organization', '미입력'),
    COALESCE((NEW.raw_user_meta_data->>'birth_date')::date, '1900-01-01'),
    NEW.raw_user_meta_data->>'cohort'
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. consents (CLO 동의 5항목 — 동의·철회 일시 DB 기록) ───
CREATE TABLE public.consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'required_pii',          -- 필수1: 실명/이메일/소속 수집이용
    'required_activity',     -- 필수2: 대회참가예정+밋업RSVP 수집이용
    'required_disclosure',   -- 필수3: 멤버간 정보공개 (실명/소속/참가예정)
    'service_notif',         -- 선택1: 서비스 알림 수신
    'marketing_email'        -- 선택2: 마케팅 수신 (agreed_at 기록 = CLO 의무)
  )),
  agreed       BOOLEAN NOT NULL,
  agreed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  UNIQUE (user_id, consent_type)
);

-- ── 3. 초대 시스템 (SEC-01~04, SEC-08) ──────────────────────
CREATE TABLE public.invite_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE
               CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),  -- Crockford BASE32 12자 (I,L,O,U 제외)
  cohort_label TEXT NOT NULL,
  max_uses     INTEGER NOT NULL DEFAULT 30 CHECK (max_uses BETWEEN 1 AND 500),
  use_count    INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.invite_code_uses (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id   UUID NOT NULL REFERENCES public.invite_codes(id),
  used_by   UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,  -- 개인 1회 (SEC-02)
  used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.invite_redeem_attempts (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  success      BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX invite_redeem_attempts_user_idx
  ON public.invite_redeem_attempts (user_id, attempted_at DESC);

CREATE TABLE public.allowed_emails (              -- SEC-08 화이트리스트
  email        TEXT PRIMARY KEY,                  -- 저장 시 lower() 정규화
  cohort_label TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 멤버 판별 (SEC-05) — 모든 RLS의 기준 함수
CREATE OR REPLACE FUNCTION public.is_arc_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.invite_code_uses WHERE used_by = auth.uid());
$$;

-- 코드 생성 (SEC-01: gen_random_bytes(8) → Crockford 12자, 60비트 유효 엔트로피)
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v BIGINT; out TEXT := ''; i INT;
BEGIN
  v := abs(('x' || encode(gen_random_bytes(8), 'hex'))::bit(64)::bigint);
  FOR i IN 1..12 LOOP
    out := out || substr(alphabet, (v % 32)::int + 1, 1);
    v := v / 32;
  END LOOP;
  RETURN out;
END $$;

-- 운영용 코드 발급 (회장이 SQL Editor에서만 실행 — authenticated 실행 차단)
CREATE OR REPLACE FUNCTION public.admin_create_invite_code(
  p_cohort TEXT, p_max_uses INT DEFAULT 130, p_expires TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code TEXT := public.generate_invite_code();
BEGIN
  INSERT INTO public.invite_codes (code, cohort_label, max_uses, expires_at)
  VALUES (v_code, p_cohort, p_max_uses, p_expires);
  RETURN v_code;  -- 표시 형식: XXXX-XXXX-XXXX (대시는 표시용, DB는 12자 연속 저장)
END $$;

-- ★ redeem RPC 전문 (SEC-02·03·08 통합) ★
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_fails INT;
  v_norm TEXT;
  v_row public.invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invite_code_uses WHERE used_by = v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- 브루트포스 차단: 실패 5회/1시간 (SEC-03)
  SELECT count(*) INTO v_fails FROM public.invite_redeem_attempts
   WHERE user_id = v_uid AND success = false
     AND attempted_at > NOW() - INTERVAL '1 hour';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  END IF;

  -- 정규화: 대문자화 + 대시/공백 제거 + 오인문자 매핑 (O→0, I→1, L→1, U→V)
  v_norm := upper(regexp_replace(p_code, '[\s\-]', '', 'g'));
  v_norm := translate(v_norm, 'OILU', '011V');

  -- 화이트리스트 (SEC-08) — 코드 오류와 동일 응답(존재 여부 오라클 방지)
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_norm !~ '^[0-9A-HJKMNP-TV-Z]{12}$'
     OR NOT EXISTS (SELECT 1 FROM public.allowed_emails
                    WHERE email = lower(v_email) AND is_active) THEN
    INSERT INTO public.invite_redeem_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  SELECT * INTO v_row FROM public.invite_codes
   WHERE code = v_norm AND is_active
     AND (expires_at IS NULL OR expires_at > NOW())
   FOR UPDATE;

  IF NOT FOUND OR v_row.use_count >= v_row.max_uses THEN
    INSERT INTO public.invite_redeem_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  INSERT INTO public.invite_code_uses (code_id, used_by) VALUES (v_row.id, v_uid);
  UPDATE public.invite_codes SET use_count = use_count + 1 WHERE id = v_row.id;
  INSERT INTO public.invite_redeem_attempts (user_id, success) VALUES (v_uid, true);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 4. races (큐레이션 시드 전용 — 크롤러 없음, CLO) ────────
CREATE TABLE public.races (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  race_date    DATE,                            -- DEV-1: NULL = 일정 미정 (시드 19/43건)
  region       TEXT NOT NULL,
  venue        TEXT,
  courses      TEXT[] NOT NULL DEFAULT '{}',
  reg_start    DATE,
  reg_end      DATE,
  reg_status   TEXT NOT NULL DEFAULT 'unknown'
               CHECK (reg_status IN ('open','closed','upcoming','unknown')),
  organizer    TEXT,
  official_url TEXT CHECK (official_url IS NULL OR official_url ~ '^https?://'),
  confidence   TEXT CHECK (confidence IN ('high','medium','low')),
  source_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX races_date_idx ON public.races (race_date);

-- ── 5. race_attendance (Who's Going) ───────────────────────
CREATE TABLE public.race_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id    UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- 탈퇴 즉시삭제 (CLO)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (race_id, user_id)
);
CREATE INDEX race_attendance_race_idx ON public.race_attendance (race_id);

-- ── 6. hubs / meetups / meetup_rsvp ────────────────────────
CREATE TABLE public.hubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  city        TEXT,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO public.hubs (name, city, sort_order) VALUES
  ('Seoul Hub', '서울', 1), ('Daejeon Hub', '대전', 2);

CREATE TABLE public.meetups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id        UUID NOT NULL REFERENCES public.hubs(id),
  host_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id       UUID REFERENCES public.races(id),     -- 대회 연계 밋업(선택)
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  description   TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  meet_at       TIMESTAMPTZ NOT NULL,
  location_text TEXT NOT NULL CHECK (char_length(location_text) BETWEEN 2 AND 120),
  -- ⚠️ 장소는 텍스트만. 좌표(lat/lng) 컬럼 추가 금지 — 위치정보법 Phase1 비해당 유지 (CLO)
  capacity      INTEGER NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 2 AND 50),
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','full','canceled','done')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX meetups_meet_at_idx ON public.meetups (meet_at);
CREATE INDEX meetups_hub_idx ON public.meetups (hub_id);

CREATE TABLE public.meetup_rsvp (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id  UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined','canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meetup_id, user_id)
);
CREATE TRIGGER meetup_rsvp_updated_at BEFORE UPDATE ON public.meetup_rsvp
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 7. notifications (인앱 알림함) ──────────────────────────
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ntype       TEXT NOT NULL CHECK (ntype IN
              ('meetup_reminder','meetup_rsvp','meetup_canceled','meetup_updated','race_reg','system')),
  title       TEXT NOT NULL,
  body        TEXT,
  link_target TEXT,            -- 해시 라우트만 (예: '#/meetup/uuid'). user 정보 금지 (SEC-11)
  read_at     TIMESTAMPTZ,
  email_state TEXT NOT NULL DEFAULT 'none'
              CHECK (email_state IN ('none','queued','sent','skipped')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- ── 8. 조회 RPC (SEC-06·09: 이메일 미반환, 페이지당 20건 강제) ──
CREATE OR REPLACE FUNCTION public.get_member_directory(p_offset INT DEFAULT 0)
RETURNS TABLE (full_name TEXT, organization TEXT, cohort TEXT, bio TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT up.full_name, up.organization, up.cohort, up.bio
    FROM public.users_profile up
    JOIN public.invite_code_uses icu ON icu.used_by = up.user_id
   WHERE public.is_arc_member() AND up.profile_visibility = 'members'
   ORDER BY up.full_name
   LIMIT 20 OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_race_board()
RETURNS TABLE (id UUID, name TEXT, race_date DATE, region TEXT, venue TEXT,
               courses TEXT[], reg_start DATE, reg_end DATE, reg_status TEXT,
               organizer TEXT, official_url TEXT,
               going_count BIGINT, i_am_going BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.name, r.race_date, r.region, r.venue, r.courses,
         r.reg_start, r.reg_end, r.reg_status, r.organizer, r.official_url,
         count(ra.id) AS going_count,
         bool_or(ra.user_id = auth.uid()) AS i_am_going
    FROM public.races r
    LEFT JOIN public.race_attendance ra ON ra.race_id = r.id
   WHERE public.is_arc_member()
     AND (r.race_date IS NULL OR r.race_date >= CURRENT_DATE - INTERVAL '1 day')  -- DEV-1: 일정 미정 포함
   GROUP BY r.id
   ORDER BY r.race_date NULLS LAST;                                              -- DEV-1: 미정은 맨 뒤
$$;

CREATE OR REPLACE FUNCTION public.get_race_attendees(p_race_id UUID, p_offset INT DEFAULT 0)
RETURNS TABLE (full_name TEXT, organization TEXT, cohort TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT up.full_name, up.organization, up.cohort
    FROM public.race_attendance ra
    JOIN public.users_profile up ON up.user_id = ra.user_id
   WHERE public.is_arc_member() AND ra.race_id = p_race_id
     AND up.profile_visibility = 'members'
   ORDER BY ra.created_at
   LIMIT 20 OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_meetup_board(p_hub_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, hub_id UUID, hub_name TEXT, host_name TEXT, race_id UUID,
               title TEXT, description TEXT, meet_at TIMESTAMPTZ, location_text TEXT,
               capacity INT, status TEXT, joined_count BIGINT,
               my_status TEXT, i_am_host BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.hub_id, h.name, up.full_name, m.race_id,
         m.title, m.description, m.meet_at, m.location_text,
         m.capacity, m.status,
         count(r.id) FILTER (WHERE r.status = 'joined') AS joined_count,
         max(r2.status) AS my_status,
         (m.host_id = auth.uid()) AS i_am_host
    FROM public.meetups m
    JOIN public.hubs h ON h.id = m.hub_id
    LEFT JOIN public.users_profile up ON up.user_id = m.host_id
    LEFT JOIN public.meetup_rsvp r  ON r.meetup_id = m.id
    LEFT JOIN public.meetup_rsvp r2 ON r2.meetup_id = m.id AND r2.user_id = auth.uid()
   WHERE public.is_arc_member()
     AND (p_hub_id IS NULL OR m.hub_id = p_hub_id)
     AND m.status <> 'canceled'
     AND m.meet_at > NOW() - INTERVAL '12 hours'
   GROUP BY m.id, h.name, up.full_name
   ORDER BY m.meet_at;
$$;

CREATE OR REPLACE FUNCTION public.get_meetup_attendees(p_meetup_id UUID, p_offset INT DEFAULT 0)
RETURNS TABLE (full_name TEXT, organization TEXT, cohort TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT up.full_name, up.organization, up.cohort
    FROM public.meetup_rsvp r
    JOIN public.users_profile up ON up.user_id = r.user_id
   WHERE public.is_arc_member() AND r.meetup_id = p_meetup_id AND r.status = 'joined'
     AND up.profile_visibility = 'members'
   ORDER BY r.created_at
   LIMIT 20 OFFSET GREATEST(p_offset, 0);
$$;

-- RSVP (정원 동시성 제어 — FOR UPDATE 직렬화 + 호스트 인앱 알림)
CREATE OR REPLACE FUNCTION public.rsvp_meetup(p_meetup_id UUID, p_join BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_m public.meetups%ROWTYPE;
  v_cnt INT;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_arc_member() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_MEMBER');
  END IF;

  SELECT * INTO v_m FROM public.meetups WHERE id = p_meetup_id FOR UPDATE;
  IF NOT FOUND OR v_m.status IN ('canceled','done') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_OPEN');
  END IF;

  IF p_join THEN
    SELECT count(*) INTO v_cnt FROM public.meetup_rsvp
     WHERE meetup_id = p_meetup_id AND status = 'joined';
    IF v_cnt >= v_m.capacity THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FULL');
    END IF;
    INSERT INTO public.meetup_rsvp (meetup_id, user_id, status)
    VALUES (p_meetup_id, v_uid, 'joined')
    ON CONFLICT (meetup_id, user_id) DO UPDATE SET status = 'joined';
    IF v_cnt + 1 >= v_m.capacity THEN
      UPDATE public.meetups SET status = 'full' WHERE id = p_meetup_id;
    END IF;
    SELECT full_name INTO v_name FROM public.users_profile WHERE user_id = v_uid;
    IF v_m.host_id <> v_uid THEN
      INSERT INTO public.notifications (user_id, ntype, title, body, link_target)
      VALUES (v_m.host_id, 'meetup_rsvp', '새 참가 신청',
              COALESCE(v_name,'멤버') || '님이 "' || v_m.title || '"에 참가합니다.',
              '#/meetup/' || p_meetup_id);
    END IF;
  ELSE
    UPDATE public.meetup_rsvp SET status = 'canceled'
     WHERE meetup_id = p_meetup_id AND user_id = v_uid;
    UPDATE public.meetups SET status = 'open'
     WHERE id = p_meetup_id AND status = 'full';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 밋업 취소 (호스트 전용 — 참가자 전원 인앱 알림)
CREATE OR REPLACE FUNCTION public.cancel_meetup(p_meetup_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.meetups%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.meetups WHERE id = p_meetup_id AND host_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_HOST'); END IF;
  UPDATE public.meetups SET status = 'canceled' WHERE id = p_meetup_id;
  INSERT INTO public.notifications (user_id, ntype, title, body, link_target)
  SELECT r.user_id, 'meetup_canceled', '밋업 취소',
         '"' || v_m.title || '" 밋업이 취소되었습니다.', '#/meetups'
    FROM public.meetup_rsvp r
   WHERE r.meetup_id = p_meetup_id AND r.status = 'joined' AND r.user_id <> v_m.host_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 탈퇴 (SEC-10 — Phase1은 Storage 미사용이라 파일 정리 불요)
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_m RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  FOR v_m IN SELECT id, title FROM public.meetups
              WHERE host_id = v_uid AND status IN ('open','full') LOOP
    PERFORM public.cancel_meetup(v_m.id);   -- 주최 밋업 취소+참가자 통지
  END LOOP;
  DELETE FROM auth.users WHERE id = v_uid;  -- CASCADE: profile·attendance·rsvp·consents·notifications
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 9. 권한: anon 전면 차단 + RPC 실행권 정리 (SEC-05) ──────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.redeem_invite_code(TEXT),
  public.get_member_directory(INT),
  public.get_race_board(),
  public.get_race_attendees(UUID, INT),
  public.get_meetup_board(UUID),
  public.get_meetup_attendees(UUID, INT),
  public.rsvp_meetup(UUID, BOOLEAN),
  public.cancel_meetup(UUID),
  public.delete_my_account()
TO authenticated;
-- admin_create_invite_code / generate_invite_code: authenticated에게도 미부여 (SQL Editor 전용)

-- ── 10. RLS (CISO 매트릭스: anon=차단, 비멤버=차단, 멤버=공개필드, 본인=전체) ──
ALTER TABLE public.users_profile          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes           ENABLE ROW LEVEL SECURITY;  -- 정책 없음 = RPC 전용
ALTER TABLE public.invite_code_uses       ENABLE ROW LEVEL SECURITY;  -- 정책 없음 = RPC 전용
ALTER TABLE public.invite_redeem_attempts ENABLE ROW LEVEL SECURITY;  -- 정책 없음
ALTER TABLE public.allowed_emails         ENABLE ROW LEVEL SECURITY;  -- 정책 없음
ALTER TABLE public.races                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetup_rsvp            ENABLE ROW LEVEL SECURITY;  -- 직접 INSERT 차단 = RPC 전용
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;

-- users_profile: 본인만 (타인 프로필은 RPC로만 — 이메일 직접 SELECT 불가, SEC-06)
CREATE POLICY profile_select_own ON public.users_profile FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY profile_update_own ON public.users_profile FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- INSERT는 handle_new_user 트리거(definer)만 — 클라이언트 INSERT 정책 없음

-- consents: 본인만
CREATE POLICY consents_select_own ON public.consents FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY consents_insert_own ON public.consents FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY consents_update_own ON public.consents FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- races: 멤버만 읽기 (쓰기는 SQL Editor 시드만)
CREATE POLICY races_select_member ON public.races FOR SELECT
  TO authenticated USING (public.is_arc_member());

-- race_attendance: 멤버 읽기(uuid만 — 이름은 capped RPC), 본인 토글
CREATE POLICY attendance_select_member ON public.race_attendance FOR SELECT
  TO authenticated USING (public.is_arc_member());
CREATE POLICY attendance_insert_own ON public.race_attendance FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_arc_member());
CREATE POLICY attendance_delete_own ON public.race_attendance FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- hubs: 멤버 읽기
CREATE POLICY hubs_select_member ON public.hubs FOR SELECT
  TO authenticated USING (public.is_arc_member());

-- meetups: 멤버 읽기 / 멤버+본인 개설 / 호스트 수정
CREATE POLICY meetups_select_member ON public.meetups FOR SELECT
  TO authenticated USING (public.is_arc_member());
CREATE POLICY meetups_insert_host ON public.meetups FOR INSERT
  TO authenticated WITH CHECK (host_id = auth.uid() AND public.is_arc_member() AND meet_at > NOW());
CREATE POLICY meetups_update_host ON public.meetups FOR UPDATE
  TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

-- meetup_rsvp: 본인 행만 읽기 (참가자 목록·정원 카운트는 RPC) / 쓰기 정책 없음 = rsvp_meetup() 전용
CREATE POLICY rsvp_select_own ON public.meetup_rsvp FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- notifications: 본인만 읽기·읽음처리·삭제 / INSERT 정책 없음 = definer RPC·service role 전용
CREATE POLICY notif_select_own ON public.notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 10.9 UGC 모더레이션 (Apple Guideline 1.2 / Google UGC 정책 — 신고·차단)
--   필수 4요소: 신고(reports) · 차단(blocks) · 무관용 EULA(terms.html) · 24h 조치(운영절차)
-- ════════════════════════════════════════════════════════════

-- 차단: blocker가 blocked를 차단 → 상대 멤버의 참가예정·밋업이 목록에서 숨겨짐
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_select_own ON public.blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY blocks_insert_own ON public.blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY blocks_delete_own ON public.blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- 신고: 밋업·멤버 신고 접수. 운영자가 service role(대시보드)로 24h 내 조회·조치.
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('meetup','member')),
  target_id   TEXT NOT NULL,                 -- meetup uuid 또는 member uuid
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_insert_own ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_select_own ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

-- RPC: 신고 접수
CREATE OR REPLACE FUNCTION public.file_report(p_target_type TEXT, p_target_id TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED'); END IF;
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason)
  VALUES (v_uid, p_target_type, p_target_id, left(coalesce(NULLIF(p_reason,''),'(no reason)'), 500));
  RETURN jsonb_build_object('ok', true);
END $$;

-- RPC: 차단 / 해제
CREATE OR REPLACE FUNCTION public.block_member(p_blocked UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED'); END IF;
  IF v_uid = p_blocked THEN RETURN jsonb_build_object('ok', false, 'error', 'SELF'); END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (v_uid, p_blocked) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.unblock_member(p_blocked UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  DELETE FROM public.blocks WHERE blocker_id = v_uid AND blocked_id = p_blocked;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ⚠️ 차단 반영(서버측 필터): get_race_attendees / get_meetup_attendees / get_meetup_board 의
--    멤버 노출 쿼리에 다음 조건을 추가해야 차단이 목록에 적용된다(배포 시 적용):
--      AND p.user_id NOT IN (SELECT blocked_id FROM public.blocks WHERE blocker_id = auth.uid())
--    또한 attendee RPC가 차단 버튼용으로 user_id(opaque id)를 함께 반환하도록 확장 필요.
--    데모(db-demo.js)는 이름 기준 클라이언트 필터링으로 동일 UX를 즉시 제공한다.

-- ── 11. 운영 SQL 모음 (주석 보존 — 회장/CTO 수동 실행용) ────
-- 코드 발급:        SELECT public.admin_create_invite_code('KWC-1', 130, NOW() + INTERVAL '90 days');
-- 코드 유출 대응:   UPDATE public.invite_codes SET is_active = false WHERE code = 'XXXXXXXXXXXX';  -- SEC-04
-- 화이트리스트:     INSERT INTO public.allowed_emails (email, cohort_label)
--                   VALUES (lower('a@b.com'), 'KWC-1') ON CONFLICT (email) DO NOTHING;
-- 고아계정 정리:    DELETE FROM auth.users u WHERE u.created_at < NOW() - INTERVAL '24 hours'
--                   AND NOT EXISTS (SELECT 1 FROM public.invite_code_uses x WHERE x.used_by = u.id);

DO $$ BEGIN RAISE NOTICE 'ARC V3 schema 설치 완료. 다음: seed_races.sql 실행 → allowed_emails 업로드 → 코드 발급'; END $$;
