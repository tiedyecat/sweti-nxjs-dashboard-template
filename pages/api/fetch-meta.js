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
 // 🚀 Fetch data from Meta Ads API
 const response = await axios.get(
   `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights`,
   {
     params: {
       access_token: META_ACCESS_TOKEN,
       fields: "campaign_name,ad_name,impressions,reach,clicks,spend,ctr,cpc,cpm,actions,action_values",
       level: "ad",
       date_preset: "last_30d",
       time_increment: 1
     }
   }
 );

 console.log("📊 Raw Meta API Response:", JSON.stringify(response.data, null, 2));

 // ✅ If no data, short-circuit
 if (!response.data.data || response.data.data.length === 0) {
   return res.status(200).json({ message: "No ad data returned from Meta API.", data: [] });
 }

 // 🚀 Map and clean the data
 const adsData = response.data.data.map(ad => {
   const purchasesValue = ad.actions?.find(a => a.action_type === "offsite_conversion.custom")?.value || 0;

   return {
     platform: "Meta",
     campaign_name: ad.campaign_name || "Unknown",
     ad_name: ad.ad_name || "Unknown",
     location: null,
     impressions: parseInt(ad.impressions) || 0,
     reach: parseInt(ad.reach) || 0,
     clicks: parseInt(ad.clicks) || 0,
     spend: parseFloat(ad.spend) || 0,
     ctr: parseFloat(ad.ctr) || 0,
     cpm: parseFloat(ad.cpm) || 0,
     cpc: parseFloat(ad.cpc) || 0,
     leads: ad.actions?.find(a => a.action_type === "lead")?.value || 0,
     ...(purchasesValue > 0 && { purchases: purchasesValue }), // ✅ Only include purchases if > 0
     roas: 0,
     roi: 0,
     date: new Date().toISOString().split("T")[0]
   };
 });

 console.log("🧾 Cleaned Ads Data:", JSON.stringify(adsData, null, 2));

 // 🚀 Insert into Supabase
 const { data, error } = await supabase
   .from("ad_data")  // ✅ Fixed syntax
   .insert(adsData)
   .select("*"); // ✅ Forces Supabase to return inserted rows

 // ❌ Check for Supabase Insert Error
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
