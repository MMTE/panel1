import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  event_type: string;
  data: any;
  timestamp: string;
  webhook_id: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get unprocessed events
    const { data: events, error: eventsError } = await supabaseClient
      .from('event_logs')
      .select('*')
      .eq('webhook_dispatched', false)
      .order('occurred_at', { ascending: true })
      .limit(100)

    if (eventsError) {
      throw eventsError
    }

    // Get active webhooks
    const { data: webhooks, error: webhooksError } = await supabaseClient
      .from('webhooks')
      .select('*')
      .eq('is_active', true)

    if (webhooksError) {
      throw webhooksError
    }

    const results = []

    // Process each event
    for (const event of events || []) {
      // Find webhooks that listen to this event type
      const matchingWebhooks = webhooks?.filter(webhook => 
        webhook.event_types.includes(event.event_type)
      ) || []

      // Dispatch to each matching webhook
      for (const webhook of matchingWebhooks) {
        try {
          const payload: WebhookPayload = {
            event_type: event.event_type,
            data: event.event_data,
            timestamp: event.occurred_at,
            webhook_id: webhook.id,
          }

          // Create webhook signature
          const signature = await createWebhookSignature(payload, webhook.secret)

          // Send webhook
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Panel1-Signature': signature,
              'X-Panel1-Event': event.event_type,
              'User-Agent': 'Panel1-Webhooks/1.0',
            },
            body: JSON.stringify(payload),
          })

          // Log delivery attempt
          await supabaseClient
            .from('webhook_deliveries')
            .insert({
              webhook_id: webhook.id,
              event_log_id: event.id,
              attempt_number: 1,
              status: response.ok ? 'success' : 'failed',
              response_code: response.status,
              response_body: await response.text(),
              attempted_at: new Date().toISOString(),
            })

          results.push({
            webhook_id: webhook.id,
            event_id: event.id,
            status: response.ok ? 'success' : 'failed',
            response_code: response.status,
          })

        } catch (error) {
          // Log failed delivery
          await supabaseClient
            .from('webhook_deliveries')
            .insert({
              webhook_id: webhook.id,
              event_log_id: event.id,
              attempt_number: 1,
              status: 'failed',
              error_message: error.message,
              attempted_at: new Date().toISOString(),
            })

          results.push({
            webhook_id: webhook.id,
            event_id: event.id,
            status: 'failed',
            error: error.message,
          })
        }
      }

      // Mark event as webhook dispatched
      await supabaseClient
        .from('event_logs')
        .update({ webhook_dispatched: true })
        .eq('id', event.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed_events: events?.length || 0,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function createWebhookSignature(payload: WebhookPayload, secret: string): Promise<string> {
  const payloadString = JSON.stringify(payload)
  const encoder = new TextEncoder()
  const data = encoder.encode(payloadString)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, data)
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  return `sha256=${hashHex}`
}