import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

async function getUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get("dragon_session")
  if (!sessionCookie?.value) return null
  
  const supabase = getSupabaseAdmin()
  const { data: session } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", sessionCookie.value)
    .single()
  
  if (!session || new Date(session.expires_at) < new Date()) {
    return null
  }
  
  return session.user_id
}

// GET - List all tracking profiles for user
export async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const botId = searchParams.get("bot_id")
  
  let query = supabase
    .from("tracking_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  
  if (botId) {
    query = query.or(`bot_id.eq.${botId},bot_id.is.null`)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error("[API] Error fetching tracking profiles:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ profiles: data || [] })
}

// POST - Create new tracking profile
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    const { name, botId, pixelId, accessToken, utmifyToken, events, linkedFlows } = body
    
    if (!name) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
    }
    
    const supabase = getSupabaseAdmin()
    
    const { data, error } = await supabase
      .from("tracking_profiles")
      .insert({
        user_id: userId,
        bot_id: botId || null,
        name: name,
        pixel_id: pixelId || null,
        access_token: accessToken || null,
        utmify_token: utmifyToken || null,
        events: events || ["PageView", "ViewContent", "Lead", "InitiateCheckout", "Purchase"],
        linked_flows: linkedFlows || [],
        active: true,
      })
      .select()
      .single()
    
    if (error) {
      console.error("[API] Error creating tracking profile:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("[API] Error parsing request:", error)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

// PATCH - Update tracking profile
export async function PATCH(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    const { id, name, pixelId, accessToken, utmifyToken, events, linkedFlows, active } = body
    
    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 })
    }
    
    const supabase = getSupabaseAdmin()
    
    // Verify ownership
    const { data: existing } = await supabase
      .from("tracking_profiles")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single()
    
    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }
    
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (pixelId !== undefined) updates.pixel_id = pixelId
    if (accessToken !== undefined) updates.access_token = accessToken
    if (utmifyToken !== undefined) updates.utmify_token = utmifyToken
    if (events !== undefined) updates.events = events
    if (linkedFlows !== undefined) updates.linked_flows = linkedFlows
    if (active !== undefined) updates.active = active
    
    const { data, error } = await supabase
      .from("tracking_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    
    if (error) {
      console.error("[API] Error updating tracking profile:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("[API] Error parsing request:", error)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

// DELETE - Delete tracking profile
export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  
  if (!id) {
    return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 })
  }
  
  const supabase = getSupabaseAdmin()
  
  // Verify ownership
  const { data: existing } = await supabase
    .from("tracking_profiles")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single()
  
  if (!existing) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }
  
  const { error } = await supabase
    .from("tracking_profiles")
    .delete()
    .eq("id", id)
  
  if (error) {
    console.error("[API] Error deleting tracking profile:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}
