// pages/api/getAdInsights.js

export const config = {
  runtime: 'edge', // Use Edge Runtime for fast execution
};

import { createClient } from '@supabase/supabase-js';

// Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;
const API_VERSION = "v22.0";

// Initialize Supabase client
let supabase;
try {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials (SUPABASE_URL or SUPABASE_KEY).");
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("❌ Supabase Client Initialization Error:", err.message);
}

// Error response helper
function errorResponse(message, status = 500) {
  console.error("❌ Error:", message);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Default handler export
export default async function handler(req) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return errorResponse("Only GET requests allowed", 405);
  }

  // Validate critical environment variables
  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    return errorResponse("Missing Meta environment variables (META_ACCESS_TOKEN or AD_ACCOUNT_ID).");
  }

  // Meta Graph API URL - Ad-level insights
  const metaUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      access_token: META_ACCESS_TOKEN,
      fields: "date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,creative{id,name,image_url,thumbnail_url,object_story_spec},impressions,reach,clicks,ctr,spend,actions,action_values",
      level: "ad",
      date_preset: "yesterday",
      time_increment: "1"
    });

  try {
    // Fetch Meta API
    const metaRes = await fetch(metaUrl);
    if (!metaRes.ok) {
      return errorResponse(`Meta API returned non-200 status: ${metaRes.status}`, metaRes.status);
    }

    const insightsResponse = await metaRes.json();
    console.log("📊 Raw Meta Ad Insights Response:", insightsResponse);

    // Exit early if no data
    if (!insightsResponse.data || insightsResponse.data.length === 0) {
      console.warn("⚠️ No ad-level data returned from Meta API.");
      return new Response(JSON.stringify({ message: "No ad-level data returned from Meta API.", data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Clean data
    const adData = insightsResponse.data.map((ad) => {
      const impressions = parseInt(ad.impressions) || 0;
      const clicks = parseInt(ad.clicks) || 0;
      const spend = parseFloat(ad.spend) || 0;
      const ctr = parseFloat(ad.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      const leadsValue = ad.actions?.find((a) => a.action_type === "lead")?.value || 0;
      const purchasesValue = ad.actions?.find((a) => a.action_type === "purchase")?.value || 0;
      const purchaseRevenue = ad.action_values?.find((a) => a.action_type === "purchase")?.value || 0;

      return {
        platform: "Meta",
        campaign_id: ad.campaign_id || "Unknown",
        campaign_name: ad.campaign_name || "Unknown",
        adset_id: ad.adset_id || "Unknown",
        adset_name: ad.adset_name || "Unknown",
        ad_id: ad.ad_id || "Unknown",
        ad_name: ad.ad_name || "Unknown",
        date_start: ad.date_start,
        date_stop: ad.date_stop,
        impressions,
        reach: parseInt(ad.reach) || 0,
        clicks,
        spend,
        ctr,
        cpm,
        cpc,
        leads: parseInt(leadsValue),
        purchases: parseInt(purchasesValue),
        purchase_value: parseFloat(purchaseRevenue),
        creative_id: ad.creative?.id || null,
        creative_name: ad.creative?.name || null,
        image_url: ad.creative?.image_url || null,
        thumbnail_url: ad.creative?.thumbnail_url || null,
        object_story_spec: ad.creative?.object_story_spec || null
      };
    });

    console.log("🧾 Cleaned Ad-Level Data:", adData);

    // Upsert into Supabase
    const { data, error } = await supabase
      .from("ad_insights")
      .upsert(adData, { onConflict: "ad_id,date_start,date_stop" })
      .select("*");

    if (error) {
      return errorResponse(`Supabase Insert Error: ${error.message}`);
    }

    // Return successful response
    return new Response(JSON.stringify({ message: "Ad-level data saved to Supabase!", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("❌ Meta API Error:", err);
    return errorResponse(err.message);
  }
}
