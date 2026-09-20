export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'ar_controller' | 'credit_manager' | 'customer'

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '91_120' | 'over_120'
export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'disputed' | 'written_off'
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'escalated'
export type PaymentMethod = 'bank_transfer' | 'cheque' | 'card' | 'cash' | 'other'

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: { id: string; name: string; slug: string; created_at: string; active: boolean }
        Insert: { id?: string; name: string; slug: string; active?: boolean }
        Update: { name?: string; slug?: string; active?: boolean }
      }
      profiles: {
        Row: { id: string; tenant_id: string; email: string; full_name: string; role: UserRole; created_at: string }
        Insert: { id: string; tenant_id: string; email: string; full_name: string; role: UserRole }
        Update: { full_name?: string; role?: UserRole }
      }
      customers: {
        Row: {
          id: string; tenant_id: string; name: string; code: string
          credit_limit: number; credit_limit_currency: string
          risk_score: number; hubspot_id: string | null
          contact_email: string | null; contact_phone: string | null
          country: string; active: boolean; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      invoices: {
        Row: {
          id: string; tenant_id: string; customer_id: string
          invoice_number: string; amount: number; currency: string
          amount_aed: number; due_date: string; issue_date: string
          status: InvoiceStatus; days_past_due: number; aging_bucket: AgingBucket
          ecl_provision: number; outstanding: number
          created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }
      payments: {
        Row: {
          id: string; tenant_id: string; customer_id: string; invoice_id: string | null
          amount: number; currency: string; amount_aed: number
          payment_date: string; method: PaymentMethod
          reference: string | null; matched: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
      disputes: {
        Row: {
          id: string; tenant_id: string; invoice_id: string; customer_id: string
          reason: string; amount_disputed: number
          status: DisputeStatus; assigned_to: string | null
          resolution_notes: string | null
          created_at: string; updated_at: string; resolved_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['disputes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['disputes']['Insert']>
      }
      fx_rates: {
        Row: { id: string; from_currency: string; to_currency: string; rate: number; rate_date: string }
        Insert: Omit<Database['public']['Tables']['fx_rates']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['fx_rates']['Insert']>
      }
      agent_audit_trail: {
        Row: {
          id: string; tenant_id: string; agent_name: string
          action: string; entity_type: string; entity_id: string
          payload: Json; confidence_score: number; risk_level: 'low' | 'medium' | 'high'
          requires_approval: boolean; approved_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['agent_audit_trail']['Row'], 'id' | 'created_at'>
        Update: { approved_by?: string }
      }
    }
  }
}
