// ============================================================
// ARC V3 — notify-cron Edge Function (TECH_SPEC §6.3)
// 스케줄: Supabase Cron — 매일 0 0 * * * (UTC 00:00 = KST 09:00)
// 동작: 내일(KST) 밋업 D-1 리마인드 → notifications upsert
// 이메일: EMAIL_ENABLED='true' + 도메인 검증 후에만 발송 (기본 OFF — D-4)
//         CFO R-2: 일 100통 하드캡. 마케팅 메일은 이 함수에서 절대 발송하지 않음.
// 배포: supabase functions deploy notify-cron
// 시크릿: supabase secrets set RESEND_API_KEY=... EMAIL_ENABLED=false
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_ENABLED = (Deno.env.get("EMAIL_ENABLED") ?? "false") === "true";
const DAILY_EMAIL_CAP = 100; // CFO R-2 레드라인

function kstDateStr(d: Date): string {
  // KST = UTC+9 — Date를 KST 기준 YYYY-MM-DD로
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY); // service role = RLS 우회

  const now = new Date();
  const tomorrowKst = kstDateStr(new Date(now.getTime() + 24 * 3600 * 1000));
  // 내일(KST) 00:00 ~ 23:59 범위를 UTC로 환산
  const startUtc = new Date(`${tomorrowKst}T00:00:00+09:00`).toISOString();
  const endUtc = new Date(`${tomorrowKst}T23:59:59.999+09:00`).toISOString();

  // 1) 내일(KST) 열리는 밋업
  const { data: meetups, error: mErr } = await db
    .from("meetups")
    .select("id, title, meet_at, location_text, host_id")
    .in("status", ["open", "full"])
    .gte("meet_at", startUtc)
    .lte("meet_at", endUtc);
  if (mErr) {
    return new Response(JSON.stringify({ ok: false, error: mErr.message }), { status: 500 });
  }

  let notified = 0;
  let emailed = 0;
  const queued: { user_id: string; email?: string; notifId?: string }[] = [];

  for (const m of meetups ?? []) {
    // joined RSVP 사용자
    const { data: rsvps } = await db
      .from("meetup_rsvp")
      .select("user_id")
      .eq("meetup_id", m.id)
      .eq("status", "joined");
    const userIds = new Set<string>((rsvps ?? []).map((r) => r.user_id));
    userIds.add(m.host_id); // 호스트도 리마인드

    const linkTarget = `#/meetup/${m.id}`;
    const t = new Date(m.meet_at);
    const k = new Date(t.getTime() + 9 * 3600 * 1000);
    const hhmm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;

    for (const uid of userIds) {
      // 2) 중복 방지: 동일 user+ntype+link_target 존재 시 skip
      const { data: dup } = await db
        .from("notifications")
        .select("id")
        .eq("user_id", uid)
        .eq("ntype", "meetup_reminder")
        .eq("link_target", linkTarget)
        .limit(1);
      if (dup && dup.length) continue;

      // 수신자 service_notif 동의 (agreed=true, revoked_at null)
      let consented = false;
      if (EMAIL_ENABLED) {
        const { data: c } = await db
          .from("consents")
          .select("agreed, revoked_at")
          .eq("user_id", uid)
          .eq("consent_type", "service_notif")
          .maybeSingle();
        consented = !!(c && c.agreed && !c.revoked_at);
      }
      const emailState = EMAIL_ENABLED && consented ? "queued" : "skipped";

      const { data: ins, error: nErr } = await db
        .from("notifications")
        .insert({
          user_id: uid,
          ntype: "meetup_reminder",
          title: "내일 밋업이 있습니다",
          body: `${m.title} — ${hhmm} ${m.location_text}`,
          link_target: linkTarget, // 해시 라우트만 — user 정보 금지 (SEC-11)
          email_state: emailState,
        })
        .select("id")
        .single();
      if (nErr) continue;
      notified++;
      if (emailState === "queued") queued.push({ user_id: uid, notifId: ins.id });
    }
  }

  // 3) 이메일 발송 (EMAIL_ENABLED=true에서만 — 일 100통 하드캡)
  if (EMAIL_ENABLED && RESEND_API_KEY && queued.length) {
    const todayKst = kstDateStr(now);
    const dayStartUtc = new Date(`${todayKst}T00:00:00+09:00`).toISOString();
    const { count: sentToday } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("email_state", "sent")
      .gte("created_at", dayStartUtc);
    const cap = Math.max(0, DAILY_EMAIL_CAP - (sentToday ?? 0));
    const toSend = queued.slice(0, cap);
    const toSkip = queued.slice(cap);

    for (const q of toSend) {
      // 이메일 주소: users_profile (service role)
      const { data: up } = await db
        .from("users_profile")
        .select("email")
        .eq("user_id", q.user_id)
        .maybeSingle();
      if (!up?.email) {
        await db.from("notifications").update({ email_state: "skipped" }).eq("id", q.notifId);
        continue;
      }
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ARC <onboarding@resend.dev>", // 도메인 검증 후 교체 (S2)
            to: [up.email],
            subject: "[ARC] 내일 밋업 리마인드",
            text: "내일 예정된 밋업이 있습니다. 앱 알림함에서 확인해 주세요.",
          }),
        });
        await db
          .from("notifications")
          .update({ email_state: r.ok ? "sent" : "skipped" }) // 실패 무시 — 인앱이 보장 채널
          .eq("id", q.notifId);
        if (r.ok) emailed++;
      } catch {
        await db.from("notifications").update({ email_state: "skipped" }).eq("id", q.notifId);
      }
    }
    for (const q of toSkip) {
      await db.from("notifications").update({ email_state: "skipped" }).eq("id", q.notifId);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, meetups: (meetups ?? []).length, notified, emailed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
