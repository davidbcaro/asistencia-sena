// Supabase Edge Function: delete-ficha
// Deletes a ficha and all associated students and their attendance records

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

    const { fichaId } = await req.json();

    if (!fichaId) {
      return new Response(
        JSON.stringify({ error: "Invalid request. 'fichaId' is required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get ficha to know the code
    const { data: ficha, error: fichaError } = await supabase
      .from("fichas")
      .select("id, code")
      .eq("id", fichaId)
      .single();

    if (fichaError) {
      console.error("Ficha fetch error:", fichaError);
      return new Response(
        JSON.stringify({ error: "Ficha not found", details: fichaError.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get all students in this ficha (active and inactive)
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .eq("group", ficha.code);

    if (studentsError) {
      console.error("Student fetch error:", studentsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch students", details: studentsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Delete attendance records for all students in this ficha
    if (students && students.length > 0) {
      const studentIds = students.map(s => s.id);
      
      const { error: attendanceError } = await supabase
        .from("attendance")
        .delete()
        .in("student_id", studentIds);

      if (attendanceError) {
        console.error("Attendance delete error:", attendanceError);
        return new Response(
          JSON.stringify({ error: "Failed to delete attendance records", details: attendanceError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Delete all students in this ficha
      const { error: studentsDeleteError } = await supabase
        .from("students")
        .delete()
        .in("id", studentIds);

      if (studentsDeleteError) {
        console.error("Students delete error:", studentsDeleteError);
        return new Response(
          JSON.stringify({ error: "Failed to delete students", details: studentsDeleteError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log(`Deleted ${students.length} students and their attendance records`);
    }

    // Finally, delete the ficha
    const { error: deleteError } = await supabase
      .from("fichas")
      .delete()
      .eq("id", fichaId);

    if (deleteError) {
      console.error("Ficha delete error:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete ficha", details: deleteError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Ficha and ${students?.length || 0} associated student(s) deleted successfully` 
      }),
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

