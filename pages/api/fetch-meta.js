import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// 1. Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID; // e.g., "act_1234567890"
const API_VERSION = "v22.0"; // Updated to API version 22.0

// 2. Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. Custom Conversions: Map of Meta action_target_id to Supabase column names
const CUSTOM_CONVERSIONS = {
  "1303318332892874": "keizer_sa_sign_up",
  "1622613281250293": "physiq_sync_acquire_lead",
  "1303301071575935": "salem_sa_sign_up",
  "626817764433141":  "physiq_website_form_submission",
  "122528708402051":  "lancaster_sa_sign_up",
  "1265364401998883": "albany_sa_sign_up",
  "172684631905198":  "downtown_sa_sign_up"
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Only GET requests allowed" });
  }

  try {
    // 4. Fetch Meta Ads Insights Data using API v22.0
    const insightsResponse = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`,
      {
        params: {
          access_token: META_ACCESS_TOKEN,
          fields: "date_start,date_stop,ad_id,impressions,reach,clicks,ctr,spend,actions",
          level: "ad",
          date_preset: "last_30d",
          time_increment: 1
        }
      }
    );

    console.log("📊 Raw Meta API Response:", JSON.stringify(insightsResponse.data, null, 2));

    // 5. Exit early if no data returned
    if (!insightsResponse.data.data || insightsResponse.data.data.length === 0) {
      return res.status(200).json({ message: "No ad data returned from Meta API.", data: [] });
    }

    // 6. Process the Data: calculate CPL and CPP in addition to standard metrics
    const adsData = insightsResponse.data.data.map(ad => {
      const impressions = parseInt(ad.impressions) || 0;
      const clicks = parseInt(ad.clicks) || 0;
      const spend = parseFloat(ad.spend) || 0;
      const ctr = parseFloat(ad.ctr) || 0;
      
      // Standard events
      const leadsValue = ad.actions?.find(a => a.action_type === "lead")?.value || 0;
      const purchasesValue = ad.actions?.find(a => a.action_type === "purchase")?.value || 0;
      
      // Compute cost metrics safely
      const cpl = leadsValue > 0 ? spend / leadsValue : 0;
      const cpp = purchasesValue > 0 ? spend / purchasesValue : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      // Initialize custom conversion counts for each column as 0
      const customCounts = {};
      for (const [targetId, colName] of Object.entries(CUSTOM_CONVERSIONS)) {
        customCounts[colName] = 0;
      }
      
      // Accumulate custom conversion counts from actions based on action_target_id
      const actions = ad.actions || [];
      actions.forEach(action => {
        const targetId = action.action_target_id;
        if (CUSTOM_CONVERSIONS[targetId]) {
          const colName = CUSTOM_CONVERSIONS[targetId];
          customCounts[colName] += parseInt(action.value) || 0;
        }
      });

      return {
        platform: "Meta",
        ad_id: ad.ad_id || "Unknown",
        date_range: `${ad.date_start} - ${ad.date_stop}`,
        impressions,
        reach: parseInt(ad.reach) || 0,
        clicks,
        spend,
        ctr,
        cpm,
        cpc,
        leads: leadsValue,
        purchases: purchasesValue,
        cpl,
        cpp,
        // Spread in all custom conversion counts
        ...customCounts
      };
    });

    console.log("🧾 Cleaned Ads Data:", JSON.stringify(adsData, null, 2));

    // 7. Insert the data into Supabase, returning inserted rows
    const { data, error } = await supabase
      .from("ad_data")
      .insert(adsData)
      .select("*");

    if (error) {
      console.error("❌ Supabase Insert Error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: "Meta data saved to Supabase!", data });
  } catch (error) {
    console.error("❌ Meta API Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}


