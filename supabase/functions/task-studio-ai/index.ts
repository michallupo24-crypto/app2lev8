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
    const { action, prompt, code, subject, topic, numQuestions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userMessage = "";

    switch (action) {
      case "game-design":
        systemPrompt = `אתה מעצב משחקים חינוכיים מומחה. תמיד ענה בעברית. החזר JSON בלבד עם המבנה:
{ "name": "שם המשחק", "description": "תיאור", "stages": 5, "rules": ["כלל1","כלל2"], "scoring": "תיאור ניקוד", "questions_per_stage": 3 }`;
        userMessage = prompt;
        break;

      case "optimize-code":
        systemPrompt = `אתה מומחה אופטימיזציה לקוד HTML/JS. בצע את השינויים הבאים:
1. התאם לאייפד (responsive, touch-friendly)
2. הוסף RTL support
3. הוסף מנגנון postMessage לשליחת ציונים: window.parent.postMessage({ type: 'GRADE', score: X }, '*')
4. שפר UX עם אנימציות ועיצוב נקי
החזר רק את הקוד HTML המעודכן המלא, ללא הסברים.`;
        userMessage = code;
        break;

      case "scan-file":
        systemPrompt = `אתה מומחה בחילוץ שאלות מחומרי לימוד. נתח את התוכן וחלץ שאלות ותשובות מגוונות.
החזר JSON array בלבד עם אובייקטים במבנה:
[{ "question_text": "...", "question_type": "multiple_choice", "options": ["א","ב","ג","ד"], "correct_answer": "א", "explanation": "..." }]
צור מגוון סוגי שאלות: multiple_choice, true_false, fill_blank.`;
        userMessage = `חלץ ${numQuestions || 10} שאלות מהתוכן הבא:\n${prompt}`;
        break;

      case "generate-questions":
        systemPrompt = `אתה מומחה ביצירת שאלות בגרות ישראליות. החזר JSON array בלבד.
כל שאלה במבנה: { "question_text": "...", "question_type": "multiple_choice", "options": ["א","ב","ג","ד"], "correct_answer": "א", "explanation": "..." }`;
        userMessage = `צור ${numQuestions || 5} שאלות במקצוע ${subject}${topic ? ` בנושא ${topic}` : ""}`;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

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
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד רגע" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "נגמרו הקרדיטים" }),
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let parsed = content;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        parsed = JSON.parse(content);
      }
    } catch {
      // Return as plain text if not JSON
      parsed = content;
    }

    return new Response(
      JSON.stringify({ result: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("task-studio-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
