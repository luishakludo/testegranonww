import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

interface TestResult {
  ok: boolean
  status?: number
  message: string
  details?: unknown
}

// Tests Meta CAPI by sending a TestEvent (action_source=chat) with optional test_event_code
async function testMeta(
  pixelId: string,
  accessToken: string,
  testEventCode?: string,
): Promise<TestResult> {
  const eventTime = Math.floor(Date.now() / 1000)
  const eventId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const externalId = crypto.createHash("sha256").update("dragon_test_user").digest("hex")

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "TestEvent",
        event_time: eventTime,
        event_id: eventId,
        action_source: "chat",
        user_data: { external_id: externalId },
      },
    ],
  }
  if (testEventCode) payload.test_event_code = testEventCode

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json?.error?.message || `HTTP ${res.status}`,
        details: json,
      }
    }
    return {
      ok: true,
      status: res.status,
      message: `Evento aceito pelo Meta. Recebidos: ${json?.events_received ?? 1}`,
      details: json,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Falha de rede ao chamar a Graph API",
    }
  }
}

// Tests UTMify by sending a no-op tracking ping
async function testUtmify(token: string): Promise<TestResult> {
  try {
    const res = await fetch("https://api.utmify.com.br/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event: "test_event",
        user_id: "dragon_test_user",
        utm_source: "dragon",
        utm_medium: "test",
        utm_campaign: "validation",
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `HTTP ${res.status}`,
        details: text,
      }
    }
    return {
      ok: true,
      status: res.status,
      message: "Token UTMify validado",
      details: text,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Falha de rede ao chamar a UTMify",
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pixelId, accessToken, utmifyToken, testEventCode } = body || {}

    const results: { meta?: TestResult; utmify?: TestResult } = {}

    if (pixelId && accessToken) {
      results.meta = await testMeta(pixelId, accessToken, testEventCode)
    } else if (pixelId || accessToken) {
      results.meta = {
        ok: false,
        message: "Pixel ID e Access Token sao obrigatorios juntos",
      }
    }

    if (utmifyToken) {
      results.utmify = await testUtmify(utmifyToken)
    }

    if (!results.meta && !results.utmify) {
      return NextResponse.json(
        { error: "Informe pixelId+accessToken ou utmifyToken" },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error("[API /api/tracking/test] Erro:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    )
  }
}
