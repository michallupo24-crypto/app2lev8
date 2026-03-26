import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { messages, grade, subject } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const gradeLabel = grade || "חטיבת ביניים";
    const subjectContext = subject ? `המקצוע הנוכחי: ${subject}.` : "";

    const systemPrompt = `אתה עוזר לימודי AI חכם בשם "מנטור" במערכת App2Class.
אתה מלמד תלמידים בשכבת ${gradeLabel} בבית ספר בישראל.
${subjectContext}

הנחיות חשובות:
- ענה תמיד בעברית, בשפה ברורה ומותאמת לגיל התלמיד.
- השתמש בדוגמאות מוחשיות ורלוונטיות לחיי היומיום של נער/ה ישראלי/ת.
- אל תיתן תשובות מלאות למטלות - במקום זה, הנח את התלמיד עם שאלות מנחות ורמזים.
- עודד חשיבה עצמאית. אם התלמיד שואל "מה התשובה?", תגיד "בוא ננסה לחשוב יחד" ותשאל שאלה מכוונת.
- השתמש באימוג'ים במידה (🎯📚✨💡) כדי להפוך את הלמידה לכיפית.
- אם התלמיד מבקש סיכום, תן סיכום מובנה עם כותרות ונקודות.
- אם התלמיד מבקש תוכנית למידה למבחן, בנה תוכנית יומית עם משימות קצרות וברורות.
- תמיד סיים בשאלה או בהצעה להמשך כדי לשמור על מעורבות.

אתה ידידותי, סבלני ומעודד. אתה מאמין בתלמיד/ה ותמיד מציע דרכים להתקדם.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד רגע 🕐" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "נגמרו הקרדיטים, יש לטעון קרדיטים נוספים" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "שגיאה בשירות ה-AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
