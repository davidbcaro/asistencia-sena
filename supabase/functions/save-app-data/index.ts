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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create Supabase client with service_role (bypasses RLS entirely)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ── GET: return all rows from app_data (used by syncAppDataFromCloud) ──────
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("app_data")
        .select("key, value_json");

      if (error) {
        console.error("Supabase GET error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: upsert one or more rows into app_data ────────────────────────────
    if (req.method === "POST") {
      const body = await req.json();

      // Normalize: accept single { key, value } or bulk { entries: [{key, value}] }
      let entries: Array<{ key: string; value: unknown }> = [];
      if (Array.isArray(body.entries)) {
        entries = body.entries;
      } else if (typeof body.key === "string") {
        entries = [{ key: body.key, value: body.value }];
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid body: expected { key, value } or { entries: [...] }" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (entries.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = entries.map(({ key, value }) => ({
        key,
        value_json: value,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("app_data")
        .upsert(rows, { onConflict: "key" });

      if (error) {
        console.error("Supabase POST error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to save app data", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully saved ${rows.length} app_data record(s)`,
          count: rows.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed. Use GET or POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
