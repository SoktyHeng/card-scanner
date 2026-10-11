export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type CardRow = {
  id: string;
  user_id: string;
  card_type: string | null;
  name: string | null;
  company: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  website: string | null;
  card_number: string | null;
  address: string | null;
  raw_ocr_text: string | null;
  ai_extraction: Json | null;
  extra_fields: Json;
  ai_confidence: number | null;
  scan_status: string;
  original_image_path: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};
export type ScanDraftRow = {
  id: string; user_id: string; revision: number; state: "active" | "saving" | "consumed" | "discarded";
  payload: Json; front_path: string | null; back_path: string | null; final_card_id: string | null;
  lease_until: string | null; created_at: string; updated_at: string; expires_at: string;
};
export type ScanDraftAssetRow = { draft_id: string; storage_path: string; uploaded: boolean; touched_at: string };
export type Database = {
  public: {
    Tables: {
      scan_drafts: {
        Row: ScanDraftRow;
        Insert: Pick<ScanDraftRow, "id" | "user_id">;
        Update: Partial<Pick<ScanDraftRow, "revision" | "state" | "payload" | "front_path" | "back_path" | "final_card_id" | "lease_until">>;
        Relationships: [];
      };
      scan_draft_assets: {
        Row: ScanDraftAssetRow;
        Insert: Pick<ScanDraftAssetRow, "draft_id" | "storage_path">;
        Update: Pick<ScanDraftAssetRow, "uploaded">;
        Relationships: [];
      };
      card_images: {
        Row: { id: string; card_id: string; side: "front" | "back"; storage_path: string; created_at: string };
        Insert: { id?: string; card_id: string; side: "front" | "back"; storage_path: string; created_at?: string };
        Update: { side?: "front" | "back"; storage_path?: string };
        Relationships: [];
      };
      cards: {
        Row: CardRow;
        Insert: Partial<CardRow> & Pick<CardRow, "user_id">;
        Update: Partial<CardRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_scan_draft: { Args: { p_id: string; p_revision: number; p_card_id: string }; Returns: ScanDraftRow[] };
      save_card_with_images: { Args: { p_card: Json; p_images: Json }; Returns: string };
      search_cards: { Args: { p_query: string }; Returns: CardRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
