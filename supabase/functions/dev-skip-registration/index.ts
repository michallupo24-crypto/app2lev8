import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRST_NAMES = ["פלוני", "אלמוני", "ישראל", "שרה", "דוד", "רחל", "משה", "מרים", "יוסי", "נועה", "עמית", "תמר"];
const LAST_NAMES = ["ישראלי", "כהן", "לוי", "מזרחי", "אברהם", "פרץ", "ביטון", "אוחנה", "דהן", "גבאי"];
const SUBJECTS = ["מתמטיקה", "אנגלית", "עברית", "היסטוריה", "פיזיקה", "ביולוגיה", "מדעי המחשב"];
const GRADES = ["ז", "ח", "ט", "י", "יא", "יב"];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { role } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const timestamp = Date.now();
    const email = `dev_${role}_${timestamp}@demo.il`;
    const password = "demo123456";
    const idNumber = String(100000000 + Math.floor(Math.random() * 899999999));
    const phone = `050${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;

    // Get a random school
    const { data: schools } = await admin.from("schools").select("id").limit(1);
    if (!schools?.length) throw new Error("No schools found");
    const schoolId = schools[0].id;

    // Get a random class
    const randomGrade = randomItem(GRADES);
    const { data: classes } = await admin
      .from("classes")
      .select("id, grade, class_number")
      .eq("school_id", schoolId)
      .eq("grade", randomGrade)
      .limit(1);
    
    const classData = classes?.[0];
    if (!classData) throw new Error("No class found");

    // Create user with admin API (auto-confirms email)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) throw authError;
    const userId = authData.user.id;

    // Update profile
    await admin.from("profiles").update({
      full_name: fullName,
      phone,
      id_number: idNumber,
      school_id: schoolId,
      class_id: role === "student" ? classData.id : null,
      is_approved: true,
    }).eq("id", userId);

    // Add role(s)
    if (role === "student") {
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "student",
      });
    } else if (role === "parent") {
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "parent",
      });
    } else if (role === "staff") {
      // Random staff role - educator
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "educator",
        grade: randomGrade,
        homeroom_class_id: classData.id,
      });
      await admin.from("teacher_classes").insert({
        user_id: userId,
        class_id: classData.id,
      });
    } else if (role === "management") {
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "management",
      });
      // Also add grade_coordinator for testing
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "grade_coordinator",
        grade: randomGrade,
      });
    }

    // No avatar for dev skip - will show default silhouette

    return new Response(JSON.stringify({ email, password, fullName, role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
