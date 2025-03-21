import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID;
const API_VERSION = "v18.0";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Only GET requests allowed" });
  }

  try {
    // 🚀 Fetch Meta Ads Insights Data
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

    // ✅ If no data, exit early
    if (!insightsResponse.data.data || insightsResponse.data.data.length === 0) {
      return res.status(200).json({ message: "No ad data returned from Meta API.", data: [] });
    }

    // 🚀 Process the Data
    const adsData = insightsResponse.data.data.map(ad => ({
  platform: "Meta",
  ad_id: ad.ad_id || "Unknown",
  date_range: `${ad.date_start} - ${ad.date_stop}`,
  impressions: parseInt(ad.impressions) || 0,
  reach: parseInt(ad.reach) || 0,
  clicks: parseInt(ad.clicks) || 0,
  spend: parseFloat(ad.spend) || 0,
  ctr: parseFloat(ad.ctr) || 0,
  purchases: ad.actions?.find(a => a.action_type === "purchase")?.value || 0, // ✅ Always included, defaults to 0
  leads: ad.actions?.find(a => a.action_type === "lead")?.value || 0 // ✅ Always included, defaults to 0
}));

    console.log("🧾 Cleaned Ads Data:", JSON.stringify(adsData, null, 2));

    // 🚀 Insert into Supabase
    const { data, error } = await supabase
      .from("ad_data")
      .insert(adsData)
      .select("*"); // ✅ Forces Supabase to return inserted rows

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

