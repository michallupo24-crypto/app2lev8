import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      grade,
      subject,
      action,         // "chat" | "exam_prep" | "generate_questions" | "open_answer_check"
      studentId,
      assignmentTitle,
      numQuestions,
      prompt,
      context,
    } = await req.json();

    // ── Determine Provider ────────────────────────────────────────────────
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    // We will use OpenAI API directly, or fallback to an error if not configured
    if (!OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY is missing! Please configure it in Supabase secrets.");
      // Temporarily use Lovable if fallback is absolutely needed, but for safety we require OPENAI
    }

    // ── Build student context from DB ──────────────────────────────────────
    let studentContext = "";
    if (studentId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const { data: profile } = await sb
          .from('profiles')
          .select('full_name, date_of_birth')
          .eq('id', studentId)
          .single();
          
        const { data: tracks } = await sb
          .from('student_tracks')
          .select('track_name, track_type, level')
          .eq('user_id', studentId);

        let ageStr = "";
        if (profile?.date_of_birth) {
           const birthYear = new Date(profile.date_of_birth).getFullYear();
           const currYear = new Date().getFullYear();
           ageStr = `בגיל ${currYear - birthYear}. `;
        }
        
        const trackNames = tracks?.map((t: any) => t.track_name).join(", ");
        const trackStr = trackNames ? `נמצא במגמות/הקבצות: ${trackNames}.` : "";

        // Get student's recent grades (last 20 graded submissions)
        const { data: subs } = await sb
          .from("submissions")
          .select("grade, assignments(title, subject, max_grade, weight_percent)")
          .eq("student_id", studentId)
          .eq("status", "graded")
          .not("grade", "is", null)
          .order("graded_at", { ascending: false })
          .limit(20);

        if (subs && subs.length > 0) {
          // Build subject averages
          const bySubject = new Map<string, number[]>();
          subs.forEach((s: any) => {
            const subj = s.assignments?.subject;
            const maxG = s.assignments?.max_grade || 100;
            if (!subj) return;
            const norm = Math.round((s.grade / maxG) * 100);
            const list = bySubject.get(subj) || [];
            list.push(norm);
            bySubject.set(subj, list);
          });

          const subjAvgs: string[] = [];
          bySubject.forEach((grades, subj) => {
            const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
            subjAvgs.push(`${subj}: ממוצע ${avg}`);
          });

          const sorted = [...bySubject.entries()]
            .map(([s, gs]) => ({ s, avg: gs.reduce((a, b) => a + b, 0) / gs.length }))
            .sort((a, b) => b.avg - a.avg);

          const strong = sorted[0]?.s;
          const weak = sorted[sorted.length - 1]?.s;

          studentContext = `
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile?.full_name || 'תלמיד'} ${ageStr}
${trackStr}
ציונים לפי מקצוע: ${subjAvgs.join(", ")}
מקצוע חזק: ${strong || "לא ידוע"}
מקצוע לשיפור (דורש מיקוד וסבלנות): ${weak || "לא ידוע"}
מספר ציונים עדכניים: ${subs.length}
`;
        } else if (profile) {
           studentContext = `
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile.full_name} ${ageStr}
${trackStr}
(עדיין אין ציונים כדי לחשב ממוצע)
`;
        }
      } catch (e) {
        console.error("Failed to load student context:", e);
        // Continue without context
      }
    }

    // ── ACTION: open_answer_check ─────────────────────────────────────────
    if (action === "open_answer_check" || context === "open_answer_check") {
      const userPrompt = prompt || (messages?.[messages.length - 1]?.content);
      const systemPrompt = `אתה בודק תשובות של תלמידים. ענה בעברית בלבד.
תן פידבק קצר ועניני (2-3 משפטים):
1. האם התשובה נכונה / חלקית נכונה / שגויה?
2. מה חסר או מה טוב?
3. הצעה קצרה לשיפור.
אל תכתוב יותר מ-4 משפטים.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      });
      const data = await response.json();
      const msg = data.choices?.[0]?.message?.content || "לא ניתן לבדוק כרגע";
      return new Response(JSON.stringify({ message: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: generate_questions ────────────────────────────────────────
    if (action === "generate_questions" || action === "scan-file") {
      const userPrompt = prompt || `צור ${numQuestions || 5} שאלות תרגול בעברית על הנושא: ${subject || assignmentTitle || "כללי"}`;
      const systemPrompt = `אתה יוצר שאלות תרגול לתלמידים בישראל.
${studentContext ? 'הכר את התלמיד עבורו אתה יוצר שאלות:\n' + studentContext + '\nהתאם את השאלות (במיוחד במקצוע החלש) שיהיו מובנות ויכללו חשיבה מודרכת.' : ''}
החזר JSON בלבד (ללא markdown, ללא הסברים) בפורמט הבא:
[
  {
    "question_type": "multiple_choice",
    "question_text": "...",
    "options": ["א. ...", "ב. ...", "ג. ...", "ד. ..."],
    "correct_answer": "א. ...",
    "explanation": "..."
  }
]
צור ${numQuestions || 5} שאלות ברמת קושי עולה. שאלות מגוונות: אמריקאי, נכון/לא-נכון, פתוח. דגש על נושא: ${subject}.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      });
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "[]";
      // Strip markdown fences if present
      const clean = raw.replace(/```json|```/g, "").trim();
      try {
        const result = JSON.parse(clean);
        return new Response(JSON.stringify({ result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ result: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: exam_prep ─────────────────────────────────────────────────
    if (action === "exam_prep") {
      const examSubject = subject || "כללי";
      const daysLeft = prompt || "7";
      const systemPrompt = `אתה יועץ לימודי. צור תוכנית לימודים למבחן ב-${examSubject} שמתקיים בעוד ${daysLeft} ימים.
${studentContext}
הנחיות:
- חלק את החומר לימים (יום 1, יום 2 וכו')
- כל יום: 30-45 דקות לימוד, משימה ספציפית קצרה
- יום אחרון: חזרה ומנוחה
- כלול הצעות לתרגול (פלאשקארדס, בוחן קצר)
- ענה בעברית, עם כותרות ברורות`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `צור תוכנית לימודים למבחן ב-${examSubject} בעוד ${daysLeft} ימים` },
          ],
          stream: false,
        }),
      });
      const data = await response.json();
      const msg = data.choices?.[0]?.message?.content || "לא ניתן ליצור תוכנית כרגע";
      return new Response(JSON.stringify({ message: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DEFAULT: streaming chat ───────────────────────────────────────────
    const gradeLabel = grade || "תיכון";
    const subjectContext = subject
      ? `המקצוע הנוכחי: ${subject}.`
      : "";

    const systemPrompt = `אתה עוזר לימודי AI בשם "מנטור" במערכת App2Class.
אתה מלמד תלמידים בשכבת ${gradeLabel} בבית ספר בישראל.
${subjectContext}
${studentContext}

הנחיות:
- ענה תמיד בעברית, בשפה ברורה ומותאמת לגיל התלמיד.
- אם אתה יודע על ציוני התלמיד, התייחס לחוזקות וחולשות שלו באופן אישי.
- אל תיתן תשובות מלאות למטלות — הנח עם שאלות מנחות ורמזים.
- עודד חשיבה עצמאית. אם שואלים "מה התשובה?", אמור "בוא ננסה לחשוב יחד".
- השתמש באימוג'ים במידה (🎯📚✨💡).
- אם מבקשים סיכום, תן סיכום מובנה עם כותרות ונקודות.
- אם מבקשים תוכנית למבחן, בנה תוכנית יומית עם משימות קצרות.
- סיים תמיד בשאלה או הצעה להמשך.
אתה ידידותי, סבלני ומעודד.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429)
        return new Response(JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד רגע 🕐" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (response.status === 402 || response.status === 401)
        return new Response(JSON.stringify({ error: "שגיאת התחברות ל-AI (וודא שמפתח OPENAI_API_KEY מעודכן)" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות ה-AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-tutor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
