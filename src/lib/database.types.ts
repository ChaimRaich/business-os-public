
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "business_members": {
                  Row: {
                    "business_id": string,"created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"document_files": {
                  Row: {
                    "business_id": string,"created_at": string,"document_id": string,"id": string,"mime_type": string,"original_name": string | null,"position": number,"sha256": string,"size_bytes": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"document_id": string,"id"?: string,"mime_type": string,"original_name"?: string | null,"position": number,"sha256": string,"size_bytes": number,"storage_path": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"document_id"?: string,"id"?: string,"mime_type"?: string,"original_name"?: string | null,"position"?: number,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_files_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"document_lines": {
                  Row: {
                    "sale_price": number | null,"club_price": number | null,"product_type": Database["public"]['Enums']["product_type"] | null,"material": Database["public"]['Enums']["material"] | null,"guessed_type": Database["public"]['Enums']["product_type"] | null,"barcode": string | null,"business_id": string,"created_at": string,"description": string | null,"discount_pct": number | null,"document_id": string,"id": string,"line_total": number | null,"match_method": string | null,"note": string | null,"position": number,"quantity": number | null,"retail_price": number | null,"supplier_sku": string | null,"uncertain_fields": (string)[],"unit": string | null,"unit_cost": number | null,"variant_id": string | null,"variant_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "sale_price"?: number | null,"club_price"?: number | null,"product_type"?: Database["public"]['Enums']["product_type"] | null,"material"?: Database["public"]['Enums']["material"] | null,"guessed_type"?: never,"barcode"?: string | null,"business_id": string,"created_at"?: string,"description"?: string | null,"discount_pct"?: number | null,"document_id": string,"id"?: string,"line_total"?: number | null,"match_method"?: string | null,"note"?: string | null,"position": number,"quantity"?: number | null,"retail_price"?: number | null,"supplier_sku"?: string | null,"uncertain_fields"?: (string)[],"unit"?: string | null,"unit_cost"?: number | null,"variant_id"?: string | null,"variant_text"?: string | null
                  }
                  Update: {
                    "sale_price"?: number | null,"club_price"?: number | null,"product_type"?: Database["public"]['Enums']["product_type"] | null,"material"?: Database["public"]['Enums']["material"] | null,"guessed_type"?: never,"barcode"?: string | null,"business_id"?: string,"created_at"?: string,"description"?: string | null,"discount_pct"?: number | null,"document_id"?: string,"id"?: string,"line_total"?: number | null,"match_method"?: string | null,"note"?: string | null,"position"?: number,"quantity"?: number | null,"retail_price"?: number | null,"supplier_sku"?: string | null,"uncertain_fields"?: (string)[],"unit"?: string | null,"unit_cost"?: number | null,"variant_id"?: string | null,"variant_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_lines_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "document_lines_variant_id_business_id_fkey"
      columns: ["variant_id","business_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"business_id": string,"created_at": string,"created_by": string | null,"doc_date": string | null,"doc_number": string | null,"doc_type": Database["public"]['Enums']["document_type"] | null,"extracted_at": string | null,"extraction_error": string | null,"extraction_model": string | null,"extraction_notes": string | null,"extraction_started_at": string | null,"id": string,"printed_quantity": number | null,"printed_subtotal": number | null,"printed_total": number | null,"printed_vat": number | null,"status": Database["public"]['Enums']["document_status"],"supplier_id": string | null,"supplier_name_raw": string | null,"supplier_tax_id_raw": string | null,"vat_rate": number | null,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"doc_date"?: string | null,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["document_type"] | null,"extracted_at"?: string | null,"extraction_error"?: string | null,"extraction_model"?: string | null,"extraction_notes"?: string | null,"extraction_started_at"?: string | null,"id": string,"printed_quantity"?: number | null,"printed_subtotal"?: number | null,"printed_total"?: number | null,"printed_vat"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"supplier_id"?: string | null,"supplier_name_raw"?: string | null,"supplier_tax_id_raw"?: string | null,"vat_rate"?: number | null,"warehouse_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"doc_date"?: string | null,"doc_number"?: string | null,"doc_type"?: Database["public"]['Enums']["document_type"] | null,"extracted_at"?: string | null,"extraction_error"?: string | null,"extraction_model"?: string | null,"extraction_notes"?: string | null,"extraction_started_at"?: string | null,"id"?: string,"printed_quantity"?: number | null,"printed_subtotal"?: number | null,"printed_total"?: number | null,"printed_vat"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"supplier_id"?: string | null,"supplier_name_raw"?: string | null,"supplier_tax_id_raw"?: string | null,"vat_rate"?: number | null,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_supplier_id_business_id_fkey"
      columns: ["supplier_id","business_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "documents_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"label": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"label"?: string,"product_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"label"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_business_id_fkey"
      columns: ["product_id","business_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"products": {
                  Row: {
                    "product_type": Database["public"]['Enums']["product_type"] | null,"material": Database["public"]['Enums']["material"] | null,"sale_price": number | null,"club_price": number | null,"business_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "product_type"?: Database["public"]['Enums']["product_type"] | null,"material"?: Database["public"]['Enums']["material"] | null,"sale_price"?: number | null,"club_price"?: number | null,"business_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "product_type"?: Database["public"]['Enums']["product_type"] | null,"material"?: Database["public"]['Enums']["material"] | null,"sale_price"?: number | null,"club_price"?: number | null,"business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_supplier_id_business_id_fkey"
      columns: ["supplier_id","business_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"departments": {
                  Row: {
                    "business_id": string,"code": number,"department": string,"product_type": Database["public"]['Enums']["product_type"],"sub_department": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"code": number,"department": string,"product_type": Database["public"]['Enums']["product_type"],"sub_department": string
                  }
                  Update: {
                    "business_id"?: string,"code"?: number,"department"?: string,"product_type"?: Database["public"]['Enums']["product_type"],"sub_department"?: string
                  }
                  Relationships: [
                    { foreignKeyName: "departments_business_id_fkey", columns: ["business_id"], isOneToOne: false, referencedRelation: "businesses", referencedColumns: ["id"] }
                  ]
                },"pos_exports": {
                  Row: {
                    "business_id": string,"content_base64": string,"created_at": string,"created_by": string | null,"document_id": string,"file_name": string,"id": string,"pos_status": string,"row_count": number,"template_version": string,"uploaded_at": string | null,"uploaded_by": string | null,"variant_ids": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"content_base64": string,"created_at"?: string,"created_by"?: string | null,"document_id": string,"file_name": string,"id"?: string,"pos_status"?: string,"row_count": number,"template_version": string,"uploaded_at"?: string | null,"uploaded_by"?: string | null,"variant_ids": (string)[]
                  }
                  Update: {
                    "business_id"?: string,"content_base64"?: string,"created_at"?: string,"created_by"?: string | null,"document_id"?: string,"file_name"?: string,"id"?: string,"pos_status"?: string,"row_count"?: number,"template_version"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null,"variant_ids"?: (string)[]
                  }
                  Relationships: [
                    { foreignKeyName: "pos_exports_document_id_business_id_fkey", columns: ["document_id","business_id"], isOneToOne: true, referencedRelation: "documents", referencedColumns: ["id","business_id"] }
                  ]
                },"stock_balances": {
                  Row: {
                    "business_id": string,"quantity": number,"updated_at": string,"variant_id": string,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"quantity": number,"updated_at"?: string,"variant_id": string,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"quantity"?: number,"updated_at"?: string,"variant_id"?: string,"warehouse_id"?: string
                  }
                  Relationships: [
                    { foreignKeyName: "stock_balances_variant_id_business_id_fkey", columns: ["variant_id","business_id"], isOneToOne: false, referencedRelation: "product_variants", referencedColumns: ["id","business_id"] },
                    { foreignKeyName: "stock_balances_warehouse_id_business_id_fkey", columns: ["warehouse_id","business_id"], isOneToOne: false, referencedRelation: "warehouses", referencedColumns: ["id","business_id"] }
                  ]
                },"stock_movements": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"document_id": string | null,"id": string,"kind": Database["public"]['Enums']["movement_kind"],"quantity": number,"reason": string | null,"request_id": string | null,"variant_id": string,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["movement_kind"],"quantity": number,"reason"?: string | null,"request_id"?: string | null,"variant_id": string,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["movement_kind"],"quantity"?: number,"reason"?: string | null,"request_id"?: string | null,"variant_id"?: string,"warehouse_id"?: string
                  }
                  Relationships: [
                    { foreignKeyName: "stock_movements_document_id_business_id_fkey", columns: ["document_id","business_id"], isOneToOne: false, referencedRelation: "documents", referencedColumns: ["id","business_id"] },
                    { foreignKeyName: "stock_movements_variant_id_business_id_fkey", columns: ["variant_id","business_id"], isOneToOne: false, referencedRelation: "product_variants", referencedColumns: ["id","business_id"] },
                    { foreignKeyName: "stock_movements_warehouse_id_business_id_fkey", columns: ["warehouse_id","business_id"], isOneToOne: false, referencedRelation: "warehouses", referencedColumns: ["id","business_id"] }
                  ]
                },"suppliers": {
                  Row: {
                    "club_multiplier": number,"sale_markup_pct": number,"next_barcode_number": number,"address": string | null,"business_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"phone": string | null,"pos_code": string | null,"pos_name": string | null,"tax_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "club_multiplier"?: number,"sale_markup_pct"?: number,"next_barcode_number"?: number,"address"?: string | null,"business_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"pos_code"?: string | null,"pos_name"?: string | null,"tax_id"?: string | null
                  }
                  Update: {
                    "club_multiplier"?: number,"sale_markup_pct"?: number,"next_barcode_number"?: number,"address"?: string | null,"business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"pos_code"?: string | null,"pos_name"?: string | null,"tax_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"variant_codes": {
                  Row: {
                    "allocated": boolean,"business_id": string,"code": string,"code_norm": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["code_kind"],"supplier_id": string | null,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allocated"?: boolean,"business_id": string,"code": string,"code_norm"?: never,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["code_kind"],"supplier_id"?: string | null,"variant_id": string
                  }
                  Update: {
                    "allocated"?: boolean,"business_id"?: string,"code"?: string,"code_norm"?: never,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["code_kind"],"supplier_id"?: string | null,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variant_codes_supplier_id_business_id_fkey"
      columns: ["supplier_id","business_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "variant_codes_variant_id_business_id_fkey"
      columns: ["variant_id","business_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"warehouses": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"is_default": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"is_default"?: boolean,"name": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"is_default"?: boolean,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "warehouses_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_member_by_email":
{ Args: { "p_business_id": string,"p_email": string,"p_role"?: Database["public"]['Enums']["member_role"] }; Returns: string
                           },
"adjust_stock":
{ Args: { "p_document_id"?: string,"p_quantity": number,"p_reason": string,"p_request_id": string,"p_variant_id": string,"p_warehouse_id": string }; Returns: boolean
                           },
"approve_document":
{ Args: { "p_document_id": string }; Returns: boolean
                           },
"assign_internal_barcodes":
{ Args: { "p_document_id": string }; Returns: undefined
                           },
"create_item_for_line":
{ Args: { "p_label": string,"p_line_id": string,"p_material"?: Database["public"]['Enums']["material"],"p_name": string,"p_product_id": string | null,"p_product_type"?: Database["public"]['Enums']["product_type"] }; Returns: string
                           },
"fill_line_cost":
{ Args: { "p_cost": number,"p_line_id": string }; Returns: undefined
                           },
"link_document_line":
{ Args: { "p_line_id": string,"p_variant_id": string | null }; Returns: undefined
                           },
"mark_export_uploaded":
{ Args: { "p_export_id": string }; Returns: undefined
                           },
"create_business":
{ Args: { "p_name": string }; Returns: string
                           },
"create_product":
{ Args: { "p_business_id": string,"p_name": string,"p_notes"?: string,"p_supplier_id"?: string,"p_variants"?: Json }; Returns: string
                           },
"match_document_lines":
{ Args: { "p_document_id": string }; Returns: undefined
                           },
"replace_document_lines":
{ Args: { "p_document_id": string,"p_lines": Json }; Returns: undefined
                           },
"search_products":
{ Args: { "p_business_id": string,"p_query"?: string }; Returns: {
              "business_id": string,
"created_at": string,
"id": string,
"name": string,
"notes": string | null,
"supplier_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "products"
        isOneToOne: false
        isSetofReturn: true
      } },
"set_default_warehouse":
{ Args: { "p_warehouse_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "code_kind": "barcode"|"supplier_sku"|"pos"|"web","document_status": "uploaded"|"extracting"|"review"|"failed"|"approved","document_type": "delivery_note"|"tax_invoice"|"tax_invoice_receipt"|"other","material": "silver"|"gold","member_role": "owner"|"manager"|"staff","movement_kind": "receipt"|"adjustment","product_type": "ring"|"earring"|"necklace"|"bracelet"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "code_kind": ["barcode", "supplier_sku", "pos", "web"],"document_status": ["uploaded", "extracting", "review", "failed", "approved"],"document_type": ["delivery_note", "tax_invoice", "tax_invoice_receipt", "other"],"material": ["silver", "gold"],"member_role": ["owner", "manager", "staff"],"movement_kind": ["receipt", "adjustment"],"product_type": ["ring", "earring", "necklace", "bracelet"]
          }
        }
} as const
