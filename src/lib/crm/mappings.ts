/**
 * Client-safe catalog of NSB ↔ Salesforce field mapping metadata.
 */

export type NsbObject = "company" | "opportunity";
export type SyncDirection = "both" | "to_crm" | "from_crm";

export interface NsbFieldMeta {
  field: string;
  label: string;
  type: "text" | "number";
}

export const NSB_FIELDS: Record<NsbObject, NsbFieldMeta[]> = {
  company: [
    { field: "razao_social", label: "Razão social", type: "text" },
    { field: "cnpj", label: "CNPJ", type: "text" },
    { field: "address", label: "Endereço", type: "text" },
    { field: "contact_name", label: "Contato — nome", type: "text" },
    { field: "contact_phone", label: "Contato — telefone", type: "text" },
    { field: "contact_email", label: "Contato — e-mail", type: "text" },
    { field: "segment", label: "Segmento", type: "text" },
    { field: "company_size", label: "Porte", type: "text" },
  ],
  opportunity: [
    { field: "title", label: "Título", type: "text" },
    { field: "status", label: "Status", type: "text" },
    { field: "monthly_value", label: "Valor mensal", type: "number" },
    { field: "total_contract_value", label: "Valor total do contrato", type: "number" },
    { field: "contract_months", label: "Meses previstos", type: "number" },
    { field: "quantity", label: "Quantidade", type: "number" },
  ],
};

export const NSB_OBJECT_LABELS: Record<NsbObject, string> = {
  company: "Empresa (companies)",
  opportunity: "Oportunidade (opportunities)",
};

/** Salesforce object that each NSB object maps to (v1 = Salesforce only). */
export const CRM_OBJECT_FOR: Record<NsbObject, string> = {
  company: "Account",
  opportunity: "Opportunity",
};

/** Salesforce custom field used to match NSB companies by CNPJ (must exist in the client's org). */
export const SF_CNPJ_FIELD = "CNPJ__c";

export const SALESFORCE_FIELDS: Record<string, string[]> = {
  Account: [
    "Name",
    SF_CNPJ_FIELD,
    "AccountNumber",
    "Phone",
    "Website",
    "Industry",
    "Description",
    "BillingStreet",
    "BillingCity",
    "Type",
    "Sic",
  ],

  Opportunity: [
    "Name",
    "StageName",
    "Amount",
    "Description",
    "Type",
    "NextStep",
    "Probability",
    "TotalOpportunityQuantity",
  ],
};

export const SYNC_DIRECTION_LABELS: Record<SyncDirection, string> = {
  both: "Bidirecional",
  to_crm: "NSB → CRM",
  from_crm: "CRM → NSB",
};

export interface DefaultMapping {
  nsb_object: NsbObject;
  nsb_field: string;
  crm_object: string;
  crm_field: string;
  sync_direction: SyncDirection;
}

export const DEFAULT_MAPPINGS: DefaultMapping[] = [
  { nsb_object: "company", nsb_field: "razao_social", crm_object: "Account", crm_field: "Name", sync_direction: "both" },
  { nsb_object: "company", nsb_field: "cnpj", crm_object: "Account", crm_field: SF_CNPJ_FIELD, sync_direction: "both" },

  { nsb_object: "opportunity", nsb_field: "title", crm_object: "Opportunity", crm_field: "Name", sync_direction: "both" },
  { nsb_object: "opportunity", nsb_field: "status", crm_object: "Opportunity", crm_field: "StageName", sync_direction: "both" },
  { nsb_object: "opportunity", nsb_field: "total_contract_value", crm_object: "Opportunity", crm_field: "Amount", sync_direction: "both" },
];

/** NSB opportunity status ↔ Salesforce StageName. */
export const STATUS_TO_STAGE: Record<string, string> = {
  aberta: "Prospecting",
  em_andamento: "Qualification",
  proposta_enviada: "Proposal/Price Quote",
  ganha: "Closed Won",
  perdida: "Closed Lost",
};

export const STAGE_TO_STATUS: Record<string, string> = {
  Prospecting: "aberta",
  Qualification: "em_andamento",
  "Needs Analysis": "em_andamento",
  "Value Proposition": "em_andamento",
  "Id. Decision Makers": "em_andamento",
  "Perception Analysis": "em_andamento",
  "Proposal/Price Quote": "proposta_enviada",
  "Negotiation/Review": "proposta_enviada",
  "Closed Won": "ganha",
  "Closed Lost": "perdida",
};

export function nsbFieldType(object: NsbObject, field: string): "text" | "number" {
  return NSB_FIELDS[object].find((f) => f.field === field)?.type ?? "text";
}
