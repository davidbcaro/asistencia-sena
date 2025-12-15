// Supabase Edge Function: delete-ficha
// Deletes a ficha if there are no active students in that ficha

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

    // Check for active students in this ficha
    const { count, error: countError } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("group", ficha.code)
      .eq("active", true);

    if (countError) {
      console.error("Student count error:", countError);
      return new Response(
        JSON.stringify({ error: "Failed to verify students", details: countError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if ((count || 0) > 0) {
      return new Response(
        JSON.stringify({ error: "Ficha has active students. Remove them before deleting." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

