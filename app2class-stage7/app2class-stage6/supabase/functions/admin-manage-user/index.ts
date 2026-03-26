import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is system_admin
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "system_admin")
      .single();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: system_admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: corsHeaders });
    }

    if (action === "get_user") {
      const { data: authUser, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) throw error;

      // Fetch activity summary
      const [messagesRes, attendanceRes, lessonsRes, submissionsRes, postsRes, notesRes] = await Promise.all([
        adminClient.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId),
        adminClient.from("attendance").select("id", { count: "exact", head: true }).eq("student_id", userId),
        adminClient.from("lessons").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
        adminClient.from("submissions").select("id", { count: "exact", head: true }).eq("student_id", userId),
        adminClient.from("faction_posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
        adminClient.from("lesson_notes").select("id", { count: "exact", head: true }).eq("student_id", userId),
      ]);

      return new Response(JSON.stringify({
        email: authUser.user.email,
        created_at: authUser.user.created_at,
        last_sign_in_at: authUser.user.last_sign_in_at,
        activity: {
          messages: messagesRes.count || 0,
          attendance_records: attendanceRes.count || 0,
          lessons_taught: lessonsRes.count || 0,
          submissions: submissionsRes.count || 0,
          community_posts: postsRes.count || 0,
          lesson_notes: notesRes.count || 0,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reset_password") {
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: corsHeaders });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_roles") {
      const { roles } = body; // array of role strings
      if (!Array.isArray(roles)) {
        return new Response(JSON.stringify({ error: "roles must be an array" }), { status: 400, headers: corsHeaders });
      }
      // Delete existing roles
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      // Insert new roles
      if (roles.length > 0) {
        const inserts = roles.map((role: string) => ({ user_id: userId, role }));
        const { error } = await adminClient.from("user_roles").insert(inserts);
        if (error) throw error;
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_user") {
      // Delete profile, roles, avatar, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("avatars").delete().eq("user_id", userId);
      await adminClient.from("profiles").delete().eq("id", userId);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
