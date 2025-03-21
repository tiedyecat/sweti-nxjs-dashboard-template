// pages/api/getAdsetInsights.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// 1. Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v22.0"; // If you truly need v22.0

// 2. Initialize Supabase client
let supabase;
try {
  // Check for missing environment variables before creating the client
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase credentials (SUPABASE_URL or SUPABASE_KEY).");
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error("❌ Supabase Client Initialization Error:", err.message);
}

// Helper function to create error responses
function errorResponse(res, message, status = 500) {
  console.error("❌ Error:", message);
  return res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  // 3. Only allow GET requests
  if (req.method !== 'GET') {
    return errorResponse(res, "Only GET requests allowed", 405);
  }

  // 4. Check critical environment variables
  if (!META_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    return errorResponse(res, "Missing Meta environment variables (META_ACCESS_TOKEN or AD_ACCOUNT_ID).");
  }

  try {
    // 5. Fetch Meta Ad Set Insights Data
    const metaUrl = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`;
    const params = {
      access_token: META_ACCESS_TOKEN,
      fields: "date_start,date_stop,adset_id,adset_name,impressions,reach,clicks,ctr,spend,actions",
      level: "adset",
      date_preset: "last_30d",
      time_increment: 1
    };

    const insightsResponse = await axios.get(metaUrl, { params });

    // 6. Check if Meta responded with a non-200 status
    if (insightsResponse.status !== 200) {
      return errorResponse(
        res,
        `Meta API returned non-200 status: ${insightsResponse.status}`,
        insightsResponse.status
      );
    }

    console.log("📊 Raw Meta API Response:", JSON.stringify(insightsResponse.data, null, 2));

    // 7. Exit early if no data
    if (!insightsResponse.data.data || insightsResponse.data.data.length === 0) {
      console.warn("⚠️ No ad set data returned from Meta API.");
      return res.status(200).json({ message: "No ad set data returned from Meta API.", data: [] });
    }

    // 8. Process and clean the data
    const adsetData = insightsResponse.data.data.map((adset) => {
      if (!adset.adset_id) {
        console.error("❌ Missing adset_id for one of the insights:", adset);
      }
      if (!adset.date_start || !adset.date_stop) {
        console.error("❌ Missing date_start or date_stop for ad set:", adset.adset_id);
      }
      if (!adset.impressions) {
        console.warn("⚠️ No impressions found for ad set:", adset.adset_id);
      }
      if (!adset.spend) {
        console.warn("⚠️ No spend found for ad set:", adset.adset_id);
      }

      const impressions = parseInt(adset.impressions) || 0;
      const clicks = parseInt(adset.clicks) || 0;
      const spend = parseFloat(adset.spend) || 0;
      const ctr = parseFloat(adset.ctr) || 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      // Standard events
      const leadsValue = adset.actions?.find((a) => a.action_type === "lead")?.value || 0;
      const purchasesValue = adset.actions?.find((a) => a.action_type === "purchase")?.value || 0;

      // Compute cost metrics safely
      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;

      return {
        platform: "Meta",
        adset_id: adset.adset_id || "Unknown",
        adset_name: adset.adset_name || "Unknown",
        date_start: adset.date_start,
        date_stop: adset.date_stop,
        impressions,
        reach: parseInt(adset.reach) || 0,
        clicks,
        spend,
        ctr,
        cpm,
        cpc,
        leads: leadsValue,
        purchases: purchasesValue,
        cpl,
        cpp
      };
    });

    console.log("🧾 Cleaned Ad Set Data:", JSON.stringify(adsetData, null, 2));

    // 9. Upsert the data into the adset_data table using the composite unique key
    const { data, error } = await supabase
      .from("adset_data")
      .upsert(adsetData, { onConflict: "adset_id,date_start,date_stop" })
      .select("*");

    if (error) {
      return errorResponse(res, `Supabase Insert Error: ${error.message}`);
    }

    // 10. Return success response
    return res.status(200).json({
      message: "Ad set data saved to Supabase!",
      data
    });
  } catch (error) {
    // 11. Catch any other unhandled errors
    console.error("❌ Meta API Error:", error.response?.data || error.message);
    return errorResponse(res, error.message);
  }
}
