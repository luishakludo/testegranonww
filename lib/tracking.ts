import { createClient } from "@supabase/supabase-js"

// Types
export interface TrackingUser {
  id: string
  telegram_id: string
  bot_id: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  first_seen_at: string
  last_seen_at: string
}

export interface TrackingEvent {
  id: string
  telegram_id: string
  bot_id: string
  flow_id: string | null
  event_name: string
  value: number | null
  event_id: string
  created_at: string
}

export interface TrackingProfile {
  id: string
  user_id: string
  bot_id: string | null
  name: string
  pixel_id: string | null
  access_token: string | null
  utmify_token: string | null
  events: string[]
  linked_flows: string[]
  active: boolean
  created_at: string
  updated_at: string
}

// UTM parsing from Telegram /start parameter
// Format: t.me/bot?start=utm_source=facebook&utm_campaign=teste&utm_medium=cpc
export function parseUtmFromStart(startPayload: string): Record<string, string> {
  const utms: Record<string, string> = {}
  
  if (!startPayload) return utms
  
  // Remove /start prefix if present
  const payload = startPayload.replace(/^\/start\s*/, "").trim()
  
  if (!payload) return utms
  
  // Try to parse as query string format
  const params = payload.split("&")
  for (const param of params) {
    const [key, value] = param.split("=")
    if (key && value) {
      const cleanKey = key.toLowerCase().trim()
      if (["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].includes(cleanKey)) {
        utms[cleanKey] = decodeURIComponent(value.trim())
      }
    }
  }
  
  return utms
}

// Generate unique event ID for deduplication
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

// Get Supabase admin client (for server-side operations)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Save or update tracking user with UTM data
export async function saveTrackingUser(
  botId: string,
  telegramId: string,
  utms: Record<string, string>
): Promise<TrackingUser | null> {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  
  // Check if user already exists
  const { data: existing } = await supabase
    .from("dragon_tracking_users")
    .select("*")
    .eq("bot_id", botId)
    .eq("telegram_id", telegramId)
    .single()
  
  if (existing) {
    // Update last_seen_at but DO NOT overwrite UTMs (preserve first origin)
    const { data, error } = await supabase
      .from("dragon_tracking_users")
      .update({ last_seen_at: now })
      .eq("id", existing.id)
      .select()
      .single()
    
    if (error) {
      console.error("[TRACKING] Error updating user:", error)
      return null
    }
    return data
  }
  
  // Insert new user with UTMs
  const { data, error } = await supabase
    .from("dragon_tracking_users")
    .insert({
      bot_id: botId,
      telegram_id: telegramId,
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_content: utms.utm_content || null,
      utm_term: utms.utm_term || null,
      first_seen_at: now,
      last_seen_at: now,
    })
    .select()
    .single()
  
  if (error) {
    console.error("[TRACKING] Error inserting user:", error)
    return null
  }
  
  return data
}

// Get tracking user data (for sending events)
export async function getTrackingUser(
  botId: string,
  telegramId: string
): Promise<TrackingUser | null> {
  const supabase = getSupabaseAdmin()
  
  const { data, error } = await supabase
    .from("dragon_tracking_users")
    .select("*")
    .eq("bot_id", botId)
    .eq("telegram_id", telegramId)
    .single()
  
  if (error) {
    console.error("[TRACKING] Error fetching user:", error)
    return null
  }
  
  return data
}

// Save tracking event to database
export async function saveTrackingEvent(
  botId: string,
  telegramId: string,
  flowId: string | null,
  eventName: string,
  value: number | null = null
): Promise<TrackingEvent | null> {
  const supabase = getSupabaseAdmin()
  const eventId = generateEventId()
  
  const { data, error } = await supabase
    .from("dragon_tracking_events")
    .insert({
      bot_id: botId,
      telegram_id: telegramId,
      flow_id: flowId,
      event_name: eventName,
      value: value,
      event_id: eventId,
    })
    .select()
    .single()
  
  if (error) {
    console.error("[TRACKING] Error saving event:", error)
    return null
  }
  
  return data
}

// Send event to Meta Conversion API
export async function sendToMeta(
  pixelId: string,
  accessToken: string,
  user: TrackingUser,
  eventName: string,
  eventId: string,
  value: number | null = null
): Promise<boolean> {
  if (!pixelId || !accessToken) {
    console.log("[TRACKING] Meta: Missing pixelId or accessToken")
    return false
  }
  
  const eventTime = Math.floor(Date.now() / 1000)
  
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: "system_generated",
        user_data: {
          external_id: user.telegram_id,
        },
        custom_data: value ? {
          currency: "BRL",
          value: value,
        } : undefined,
      },
    ],
  }
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error("[TRACKING] Meta API error:", errorData)
      return false
    }
    
    console.log(`[TRACKING] Meta: Sent ${eventName} for user ${user.telegram_id}`)
    return true
  } catch (error) {
    console.error("[TRACKING] Meta: Failed to send event:", error)
    return false
  }
}

// Send event to UTMify
export async function sendToUtmify(
  utmifyToken: string,
  user: TrackingUser,
  eventName: string,
  value: number | null = null
): Promise<boolean> {
  if (!utmifyToken) {
    console.log("[TRACKING] UTMify: Missing token")
    return false
  }
  
  // Map Dragon events to UTMify events (lowercase)
  const eventMap: Record<string, string> = {
    "Lead": "lead",
    "ViewContent": "view_content",
    "InitiateCheckout": "initiate_checkout",
    "Purchase": "purchase",
    "PageView": "page_view",
  }
  
  const payload = {
    event: eventMap[eventName] || eventName.toLowerCase(),
    user_id: user.telegram_id,
    utm_source: user.utm_source || "",
    utm_medium: user.utm_medium || "",
    utm_campaign: user.utm_campaign || "",
    utm_content: user.utm_content || "",
    utm_term: user.utm_term || "",
    value: value || undefined,
  }
  
  try {
    const response = await fetch("https://api.utmify.com.br/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${utmifyToken}`,
      },
      body: JSON.stringify(payload),
    })
    
    if (!response.ok) {
      const errorData = await response.text()
      console.error("[TRACKING] UTMify API error:", errorData)
      return false
    }
    
    console.log(`[TRACKING] UTMify: Sent ${eventName} for user ${user.telegram_id}`)
    return true
  } catch (error) {
    console.error("[TRACKING] UTMify: Failed to send event:", error)
    return false
  }
}

// Get active tracking profiles for a flow
export async function getTrackingProfilesForFlow(
  flowId: string
): Promise<TrackingProfile[]> {
  const supabase = getSupabaseAdmin()
  
  const { data, error } = await supabase
    .from("tracking_profiles")
    .select("*")
    .eq("active", true)
    .contains("linked_flows", [flowId])
  
  if (error) {
    console.error("[TRACKING] Error fetching profiles:", error)
    return []
  }
  
  return data || []
}

// Get active tracking profiles for a bot
export async function getTrackingProfilesForBot(
  botId: string
): Promise<TrackingProfile[]> {
  const supabase = getSupabaseAdmin()
  
  const { data, error } = await supabase
    .from("tracking_profiles")
    .select("*")
    .eq("active", true)
    .or(`bot_id.eq.${botId},bot_id.is.null`)
  
  if (error) {
    console.error("[TRACKING] Error fetching profiles:", error)
    return []
  }
  
  return data || []
}

// Main tracking function - orchestrates everything
export async function trackEvent(
  botId: string,
  telegramId: string,
  flowId: string | null,
  eventName: string,
  value: number | null = null
): Promise<{ success: boolean; eventId: string | null }> {
  console.log(`[TRACKING] trackEvent called: bot=${botId}, user=${telegramId}, event=${eventName}, value=${value}`)
  
  // 1. Get user data (with UTMs)
  const user = await getTrackingUser(botId, telegramId)
  if (!user) {
    console.log("[TRACKING] User not found in tracking database")
    return { success: false, eventId: null }
  }
  
  // 2. Save event to database
  const event = await saveTrackingEvent(botId, telegramId, flowId, eventName, value)
  if (!event) {
    console.log("[TRACKING] Failed to save event")
    return { success: false, eventId: null }
  }
  
  // 3. Get tracking profiles
  let profiles: TrackingProfile[] = []
  if (flowId) {
    profiles = await getTrackingProfilesForFlow(flowId)
  }
  if (profiles.length === 0) {
    profiles = await getTrackingProfilesForBot(botId)
  }
  
  if (profiles.length === 0) {
    console.log("[TRACKING] No active profiles found")
    return { success: true, eventId: event.event_id }
  }
  
  // 4. Send to each platform
  for (const profile of profiles) {
    // Check if this event should be sent
    if (!profile.events.includes(eventName)) {
      console.log(`[TRACKING] Skipping ${eventName} for profile ${profile.name} (not in events list)`)
      continue
    }
    
    // Send to Meta
    if (profile.pixel_id && profile.access_token) {
      await sendToMeta(
        profile.pixel_id,
        profile.access_token,
        user,
        eventName,
        event.event_id,
        value
      )
    }
    
    // Send to UTMify
    if (profile.utmify_token) {
      await sendToUtmify(profile.utmify_token, user, eventName, value)
    }
  }
  
  return { success: true, eventId: event.event_id }
}
