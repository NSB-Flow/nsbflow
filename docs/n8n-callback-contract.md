# Contrato de Dados: n8n ↔ NSB Flow

Este documento define o contrato de dados para o callback assíncrono dos agentes de IA.

## Endpoint de Callback
- **URL**: `POST /api/public/hooks/agent-result`
- **Auth**: Header `x-webhook-secret` (Valor: `N8N_CALLBACK_SECRET`)

## Formato do Payload (n8n -> App)
```json
{
  "agent_run_id": "uuid",
  "status": "completed | error",
  "result": "Markdown do relatório",
  "structured_data": {
    "meeting_score": 8.5,
    "opportunity_score": 75,
    "nps_estimate": 9,
    "analysis_completeness": 0.95,
    "briefing_used": true,
    "coaching_scores": {
      "empatia": 8,
      "escuta_ativa": 9,
      "fechamento": 7,
      ...
    }
  },
  "error": "Mensagem de erro (se status=error)"
}
```

## Especificação por Agente

| Campo | Tipo | Destino (Tabela/Coluna) | Agent |
|-------|------|-------------------------|-------|
| `result` | string | `agent_runs.result` | Todos |
| `structured_data` | jsonb | `agent_runs.structured_data` | Todos |
| `meeting_score` | number | `meeting_analyses.meeting_score` | Intelligence |
| `opportunity_score` | number | `meeting_analyses.opportunity_score` | Intelligence |
| `nps_estimate` | number | `meeting_analyses.nps_estimate` | Intelligence |
| `coaching_scores` | jsonb | `meeting_analyses.coaching_scores` | Intelligence |
| `analysis_completeness`| number | `meeting_analyses.analysis_completeness`| Intelligence |
| `briefing_used` | boolean| `meeting_analyses.briefing_used` | Intelligence |

## Padrão para Próximos Agentes (Roadmap)
Para os agentes Assessment, Leadership, Strategy e Success:
1. O App enviará o disparo e ficará em `status: processing`.
2. O n8n deverá retornar os dados estruturados no objeto `structured_data`.
3. O App salvará `structured_data` integralmente em `agent_runs` para consulta via JSONB.
4. Caso o agente precise de KPIs específicos (ex: Score de Liderança), uma tabela satélite similar a `meeting_analyses` será criada seguindo o mesmo padrão de `agent_run_id` como FK.
