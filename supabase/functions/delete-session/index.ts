// Supabase Edge Function: delete-session
// Deletes a session by id and removes related attendance records using service_role

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Invalid request. 'sessionId' is required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch session details to know date and group
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, date, group")
      .eq("id", sessionId)
      .single();

    if (sessionError) {
      console.error("Session fetch error:", sessionError);
      return new Response(
        JSON.stringify({ error: "Session not found", details: sessionError.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Delete attendance related to the session
    if (session.group === "Todas" || session.group === "Todos") {
      const { error: attendanceError } = await supabase
        .from("attendance")
        .delete()
        .eq("date", session.date);

      if (attendanceError) {
        console.error("Attendance delete error:", attendanceError);
        return new Response(
          JSON.stringify({ error: "Failed to delete attendance", details: attendanceError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id")
        .eq("group", session.group);

      if (studentsError) {
        console.error("Students fetch error:", studentsError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch students", details: studentsError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const studentIds = (students || []).map((s: { id: string }) => s.id);

      if (studentIds.length > 0) {
        const { error: attendanceError } = await supabase
          .from("attendance")
          .delete()
          .eq("date", session.date)
          .in("student_id", studentIds);

        if (attendanceError) {
          console.error("Attendance delete error:", attendanceError);
          return new Response(
            JSON.stringify({ error: "Failed to delete attendance", details: attendanceError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteError) {
      console.error("Session delete error:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete session", details: deleteError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

