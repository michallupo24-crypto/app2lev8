import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ModResult = {
  blocked: boolean;
  block_reason: string | null;
  flag: boolean;
  flag_reason: string | null;
  distress: boolean;
  distress_category: string | null;
};

function safeParseMod(text: string): Partial<ModResult> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Partial<ModResult>;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const message = String(body.message ?? "");
    const sender_name = String(body.sender_name ?? "");
    const sender_id = body.sender_id as string | undefined;
    const conversation_id = body.conversation_id as string | undefined;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const fallbackAllow: ModResult = {
      blocked: false,
      block_reason: null,
      flag: false,
      flag_reason: null,
      distress: false,
      distress_category: null,
    };

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(fallbackAllow), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You moderate a Hebrew school chat (ages 12–18). Reply with ONE JSON object only, no markdown.

Fields:
- "blocked" (boolean): true if the message is bullying, harassment, hate, sexual content, threats, severe insults, or clear netiquette violations that must NOT be posted.
- "block_reason" (string|null): short explanation in Hebrew for the student if blocked; null if not blocked.
- "flag" (boolean): true if the message is borderline or needs staff review but can still be posted (e.g. mild conflict).
- "flag_reason" (string|null): brief Hebrew reason if flag is true.
- "distress" (boolean): true if the writer may be in crisis (self-harm, suicide ideation, severe bullying victim, eating disorder crisis, explicit plea for help in distress). Do NOT set distress for normal sadness or homework stress.
- "distress_category" (string|null): short internal label in English if distress is true, e.g. "self_harm", "suicide_ideation", "severe_bullying_victim".

Rules:
- If blocked=true, the message must not appear in chat; still set distress=true if applicable.
- If distress=true but message is a cry for help without toxic content, blocked should usually be false so staff can respond.
- Never block solely for asking legitimate questions about grades or teachers (polite tone).`,
          },
          {
            role: "user",
            content: `From ${sender_name}: "${message}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify(fallbackAllow), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = safeParseMod(text);

    let result: ModResult = { ...fallbackAllow };

    if (parsed) {
      if (typeof parsed.blocked === "boolean") result.blocked = parsed.blocked;
      if (parsed.block_reason != null) result.block_reason = String(parsed.block_reason);
      if (typeof parsed.flag === "boolean") result.flag = parsed.flag;
      if (parsed.flag_reason != null) result.flag_reason = String(parsed.flag_reason);
      if (typeof parsed.distress === "boolean") result.distress = parsed.distress;
      if (parsed.distress_category != null) {
        result.distress_category = String(parsed.distress_category);
      }
    }

    // Legacy shape from older clients / prompts: { safe: boolean, reason?: string }
    if (parsed && "safe" in parsed && typeof (parsed as { safe?: boolean }).safe === "boolean") {
      const legacy = parsed as { safe: boolean; reason?: string };
      if (legacy.safe === false) {
        result.blocked = true;
        result.block_reason = legacy.reason || "התוכן אינו מתאים לשיח הקהילה";
      }
    }

    if (result.blocked) result.flag = false;

    if (result.distress && supabaseUrl && serviceKey && sender_id) {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: prof, error: profErr } = await admin
        .from("profiles")
        .select("school_id")
        .eq("id", sender_id)
        .maybeSingle();

      if (!profErr && prof?.school_id) {
        const excerpt = message.length > 400 ? message.slice(0, 400) + "…" : message;
        await admin.from("chat_safety_events").insert({
          school_id: prof.school_id,
          user_id: sender_id,
          conversation_id: conversation_id ?? null,
          message_excerpt: excerpt,
          category: result.distress_category || "distress_signal",
          severity: "high",
        });
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("moderation error:", e);
    return new Response(
      JSON.stringify({
        blocked: false,
        block_reason: null,
        flag: false,
        flag_reason: null,
        distress: false,
        distress_category: null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
