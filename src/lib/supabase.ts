import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types (generated from schema)
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
          role: 'ADMIN' | 'CLIENT' | 'RESELLER';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: 'ADMIN' | 'CLIENT' | 'RESELLER';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: 'ADMIN' | 'CLIENT' | 'RESELLER';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          company_name: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zip_code: string | null;
          country: string | null;
          phone: string | null;
          status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          country?: string | null;
          phone?: string | null;
          status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          country?: string | null;
          phone?: string | null;
          status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
          created_at?: string;
          updated_at?: string;
        };
      };
      plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          currency: string;
          interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
          is_active: boolean;
          features: any | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price: number;
          currency?: string;
          interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
          is_active?: boolean;
          features?: any | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          currency?: string;
          interval?: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
          is_active?: boolean;
          features?: any | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          client_id: string;
          user_id: string;
          subscription_id: string | null;
          invoice_number: string;
          status: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
          subtotal: number;
          tax: number;
          total: number;
          currency: string;
          due_date: string;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          user_id: string;
          subscription_id?: string | null;
          invoice_number: string;
          status?: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
          subtotal: number;
          tax?: number;
          total: number;
          currency?: string;
          due_date: string;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          user_id?: string;
          subscription_id?: string | null;
          invoice_number?: string;
          status?: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
          subtotal?: number;
          tax?: number;
          total?: number;
          currency?: string;
          due_date?: string;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}