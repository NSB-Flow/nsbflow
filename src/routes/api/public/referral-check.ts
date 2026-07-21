import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/referral-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = (url.searchParams.get('code') || '').trim().toUpperCase()
        if (!/^[A-Z0-9]{4,32}$/.test(code)) {
          return new Response(JSON.stringify({ valid: false }), {
            headers: { 'content-type': 'application/json' },
          })
        }
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .ilike('referral_code', code)
          .limit(1)
          .maybeSingle()
        return new Response(
          JSON.stringify({ valid: !error && !!data }),
          { headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
