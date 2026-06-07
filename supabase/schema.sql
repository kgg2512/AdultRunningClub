-- ============================================================
-- ARC (Adult Running Club) — Supabase Schema
-- CISO 승인: RLS 전면 활성화, anon REVOKE, Rate limit 포함
-- 실행 순서: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run
-- ============================================================

-- ── 0. 확장 기능 ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. users_profile ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users_profile (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('student','pro','founder')),
  display_name TEXT GENERATED ALWAYS AS (split_part(email, '@', 1)) STORED,
  avatar_url   TEXT,
  district     TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER users_profile_updated_at
  BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. posts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  district    TEXT NOT NULL,
  course      TEXT NOT NULL DEFAULT 'My Run',
  km          NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (km >= 0 AND km <= 1000),
  pace        TEXT,
  photo_url   TEXT,                    -- Supabase Storage signed URL 경로
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_district_created_at_idx
  ON public.posts (district, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_user_id_idx
  ON public.posts (user_id);

-- ── 3. likes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS likes_post_id_idx ON public.likes (post_id);

-- likes INSERT/DELETE 시 posts.likes_count 자동 동기화
CREATE OR REPLACE FUNCTION public.sync_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER likes_count_sync
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_likes_count();

-- ── 4. messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district    TEXT NOT NULL,
  sender_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_district_created_at_idx
  ON public.messages (district, created_at DESC);

-- ── 5. Rate limit: 좋아요 분당 10회 제한 ─────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_likes (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);

CREATE OR REPLACE FUNCTION public.check_like_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_count INTEGER;
  current_window TIMESTAMPTZ := date_trunc('minute', NOW());
BEGIN
  INSERT INTO public.rate_limit_likes (user_id, window_start, count)
  VALUES (NEW.user_id, current_window, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = rate_limit_likes.count + 1
  RETURNING count INTO current_count;

  IF current_count > 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 likes per minute';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER likes_rate_limit
  BEFORE INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.check_like_rate_limit();

-- ── 6. anon role 전면 REVOKE (CISO 요구) ──────────────────
REVOKE ALL ON public.users_profile   FROM anon;
REVOKE ALL ON public.posts           FROM anon;
REVOKE ALL ON public.likes           FROM anon;
REVOKE ALL ON public.messages        FROM anon;
REVOKE ALL ON public.rate_limit_likes FROM anon;

-- ── 7. Row Level Security 활성화 ──────────────────────────
ALTER TABLE public.users_profile    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_likes ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS 정책: users_profile ────────────────────────────
-- 본인만 읽기
CREATE POLICY "profile_select_own"
  ON public.users_profile FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 본인만 INSERT (가입 시 1회)
CREATE POLICY "profile_insert_own"
  ON public.users_profile FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인만 UPDATE
CREATE POLICY "profile_update_own"
  ON public.users_profile FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 9. RLS 정책: posts ────────────────────────────────────
-- 인증 사용자 전체 읽기 (피드용)
CREATE POLICY "posts_select_authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

-- 본인만 INSERT
CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인만 UPDATE
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인만 DELETE
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── 10. RLS 정책: likes ───────────────────────────────────
-- 인증 사용자 전체 읽기
CREATE POLICY "likes_select_authenticated"
  ON public.likes FOR SELECT
  TO authenticated
  USING (true);

-- 본인만 좋아요 추가
CREATE POLICY "likes_insert_own"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인만 좋아요 취소
CREATE POLICY "likes_delete_own"
  ON public.likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── 11. RLS 정책: messages ────────────────────────────────
-- 인증 사용자 전체 읽기
CREATE POLICY "messages_select_authenticated"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

-- 본인만 메시지 전송
CREATE POLICY "messages_insert_own"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- ── 12. RLS 정책: rate_limit_likes ───────────────────────
-- 본인 레코드만 접근
CREATE POLICY "rate_limit_own"
  ON public.rate_limit_likes FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 13. Storage 버킷: arc-photos (private) ───────────────
-- Supabase Dashboard > Storage > New bucket 에서 직접 생성:
--   Name: arc-photos
--   Public: OFF (private)
--   File size limit: 5242880 (5MB)
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- 버킷 생성 후 아래 RLS 정책 실행:

-- Storage 정책: 본인 폴더에만 업로드 가능
-- (storage.objects 테이블에 적용 — Dashboard Storage > Policies 에서도 설정 가능)
CREATE POLICY "storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'arc-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage 정책: 인증 사용자는 읽기 가능 (signed URL 발급용)
CREATE POLICY "storage_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'arc-photos');

-- Storage 정책: 본인 파일만 수정
CREATE POLICY "storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'arc-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'arc-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage 정책: 본인 파일만 삭제
CREATE POLICY "storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'arc-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 14. Auth 신규 가입 시 users_profile 자동 생성 ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users_profile (user_id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'pro')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 완료 메시지 ───────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'ARC Supabase schema 설치 완료.';
  RAISE NOTICE '다음 단계: Dashboard > Storage > arc-photos 버킷 생성 (private, 5MB 제한)';
END $$;
