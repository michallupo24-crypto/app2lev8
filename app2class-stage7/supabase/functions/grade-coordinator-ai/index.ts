import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, schoolId, userId, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get coordinator's grade
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("grade")
      .eq("user_id", userId)
      .eq("role", "grade_coordinator")
      .maybeSingle();

    const grade = roleData?.grade;
    if (!grade) {
      return new Response(JSON.stringify({ insight: "לא נמצאה שכבה משויכת." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch relevant data
    const [classesRes, lessonsRes, eventsRes, attendanceRes] = await Promise.all([
      supabase.from("classes").select("id, class_number").eq("school_id", schoolId).eq("grade", grade),
      supabase.from("lessons").select("id, subject, class_id, lesson_date, topic")
        .eq("school_id", schoolId).order("lesson_date", { ascending: false }).limit(100),
      supabase.from("grade_events").select("*").eq("school_id", schoolId).eq("grade", grade).limit(20),
      supabase.from("attendance").select("status, lesson_id").limit(500),
    ]);

    const classes = classesRes.data || [];
    const classIds = classes.map((c: any) => c.id);
    const lessons = (lessonsRes.data || []).filter((l: any) => classIds.includes(l.class_id));
    const events = eventsRes.data || [];

    // Build context for AI
    const dataContext = {
      grade,
      classCount: classes.length,
      classes: classes.map((c: any) => `${grade}'${c.class_number}`),
      totalLessons: lessons.length,
      subjectBreakdown: Object.entries(
        lessons.reduce((acc: any, l: any) => {
          acc[l.subject] = (acc[l.subject] || 0) + 1;
          return acc;
        }, {})
      ).map(([s, c]) => `${s}: ${c} שיעורים`),
      pendingEvents: events.filter((e: any) => e.status === "proposed").length,
      approvedExams: events.filter((e: any) => e.event_type === "exam" && e.status === "approved").length,
    };

    let systemPrompt = "";
    if (action === "daily_insight") {
      systemPrompt = `אתה עוזר AI לרכז שכבה בבית ספר ישראלי. תפקידך לספק תובנה יומית קצרה וממוקדת (3-4 משפטים) על מצב השכבה.
בהתבסס על הנתונים, ציין: תובנה על הקצב הלימודי, המלצה אחת לפעולה, ואזכור אירוע קרוב אם יש.
כתוב בעברית, בטון מקצועי ותומך. אל תציין מספרי ID. השתמש בשמות כיתות כמו ז'1, ח'2 וכו'.`;
    } else if (action === "progress_analysis") {
      systemPrompt = `אתה מנתח נתונים פדגוגי לרכז שכבה. נתח את מצב ההתקדמות של השכבה וספק:
1. סיכום מצב כללי
2. זיהוי כיתות שמפגרות או מובילות
3. המלצות ממוקדות לשיפור
4. נקודות חוזק של השכבה
כתוב 6-8 משפטים בעברית מקצועית.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `נתוני השכבה:\n${JSON.stringify(dataContext, null, 2)}\n\n${context ? `הקשר נוסף:\n${JSON.stringify(context)}` : ""}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "אין תובנות זמינות כרגע.";

    const resultKey = action === "daily_insight" ? "insight" : "analysis";
    return new Response(JSON.stringify({ [resultKey]: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
