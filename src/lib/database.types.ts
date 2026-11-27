
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
                    "created_at": string,"created_by": string | null,"id": string,"low_stock_default": number | null,"name": string,"onboarding_completed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"low_stock_default"?: number | null,"name": string,"onboarding_completed_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"low_stock_default"?: number | null,"name"?: string,"onboarding_completed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"campaign_posts": {
                  Row: {
                    "body": string,"business_id": string,"campaign_id": string,"channel": string,"created_at": string,"created_by": string | null,"id": string,"product_id": string | null,"published_at": string | null,"published_url": string | null,"scheduled_for": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"business_id": string,"campaign_id": string,"channel": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"product_id"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"scheduled_for"?: string | null
                  }
                  Update: {
                    "body"?: string,"business_id"?: string,"campaign_id"?: string,"channel"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"product_id"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"scheduled_for"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_posts_campaign_id_business_id_fkey"
      columns: ["campaign_id","business_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "campaign_posts_product_id_business_id_fkey"
      columns: ["product_id","business_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "budget": number | null,"business_id": string,"created_at": string,"created_by": string | null,"ends_on": string,"goal": string | null,"id": string,"name": string,"spent": number | null,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: number | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"ends_on": string,"goal"?: string | null,"id"?: string,"name": string,"spent"?: number | null,"starts_on": string
                  }
                  Update: {
                    "budget"?: number | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"goal"?: string | null,"id"?: string,"name"?: string,"spent"?: number | null,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
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
      referencedRelation: "accounting_purchases"
      referencedColumns: ["document_id","business_id"]
    },{
      foreignKeyName: "document_files_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"document_lines": {
                  Row: {
                    "barcode": string | null,"business_id": string,"created_at": string,"description": string | null,"discount_pct": number | null,"document_id": string,"id": string,"line_total": number | null,"match_method": string | null,"note": string | null,"position": number,"quantity": number | null,"retail_price": number | null,"supplier_sku": string | null,"uncertain_fields": (string)[],"unit": string | null,"unit_cost": number | null,"variant_id": string | null,"variant_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"business_id": string,"created_at"?: string,"description"?: string | null,"discount_pct"?: number | null,"document_id": string,"id"?: string,"line_total"?: number | null,"match_method"?: string | null,"note"?: string | null,"position": number,"quantity"?: number | null,"retail_price"?: number | null,"supplier_sku"?: string | null,"uncertain_fields"?: (string)[],"unit"?: string | null,"unit_cost"?: number | null,"variant_id"?: string | null,"variant_text"?: string | null
                  }
                  Update: {
                    "barcode"?: string | null,"business_id"?: string,"created_at"?: string,"description"?: string | null,"discount_pct"?: number | null,"document_id"?: string,"id"?: string,"line_total"?: number | null,"match_method"?: string | null,"note"?: string | null,"position"?: number,"quantity"?: number | null,"retail_price"?: number | null,"supplier_sku"?: string | null,"uncertain_fields"?: (string)[],"unit"?: string | null,"unit_cost"?: number | null,"variant_id"?: string | null,"variant_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_lines_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "accounting_purchases"
      referencedColumns: ["document_id","business_id"]
    },{
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
                },"document_payments": {
                  Row: {
                    "business_id": string,"document_id": string,"due_date": string | null,"paid_at": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"document_id": string,"due_date"?: string | null,"paid_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"document_id"?: string,"due_date"?: string | null,"paid_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_payments_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "accounting_purchases"
      referencedColumns: ["document_id","business_id"]
    },{
      foreignKeyName: "document_payments_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
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
                },"expenses": {
                  Row: {
                    "amount_net": number,"business_id": string,"category": string,"created_at": string,"created_by": string | null,"description": string | null,"doc_number": string | null,"due_date": string | null,"expense_date": string,"id": string,"paid_at": string | null,"vat_amount": number,"vendor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_net": number,"business_id": string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"doc_number"?: string | null,"due_date"?: string | null,"expense_date": string,"id"?: string,"paid_at"?: string | null,"vat_amount"?: number,"vendor": string
                  }
                  Update: {
                    "amount_net"?: number,"business_id"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"doc_number"?: string | null,"due_date"?: string | null,"expense_date"?: string,"id"?: string,"paid_at"?: string | null,"vat_amount"?: number,"vendor"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_departments": {
                  Row: {
                    "business_id": string,"code": string,"created_at": string,"department": string,"id": string,"item_name": string | null,"sub_department": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"code": string,"created_at"?: string,"department": string,"id"?: string,"item_name"?: string | null,"sub_department": string
                  }
                  Update: {
                    "business_id"?: string,"code"?: string,"created_at"?: string,"department"?: string,"id"?: string,"item_name"?: string | null,"sub_department"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_departments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_exports": {
                  Row: {
                    "business_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"created_by": string | null,"document_id": string,"id": string,"problem_at": string | null,"problem_by": string | null,"problem_note": string | null,"row_count": number,"rows": NonNullable<Json>,"sheet_name": string,"template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"document_id": string,"id"?: string,"problem_at"?: string | null,"problem_by"?: string | null,"problem_note"?: string | null,"row_count": number,"rows": NonNullable<Json>,"sheet_name": string,"template": string
                  }
                  Update: {
                    "business_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"document_id"?: string,"id"?: string,"problem_at"?: string | null,"problem_by"?: string | null,"problem_note"?: string | null,"row_count"?: number,"rows"?: NonNullable<Json>,"sheet_name"?: string,"template"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_exports_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_exports_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "accounting_purchases"
      referencedColumns: ["document_id","business_id"]
    },{
      foreignKeyName: "pos_exports_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "business_id": string,"club_price": number | null,"created_at": string,"id": string,"label": string,"low_stock_threshold": number | null,"product_id": string,"sale_price": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"club_price"?: number | null,"created_at"?: string,"id"?: string,"label"?: string,"low_stock_threshold"?: number | null,"product_id": string,"sale_price"?: number | null
                  }
                  Update: {
                    "business_id"?: string,"club_price"?: number | null,"created_at"?: string,"id"?: string,"label"?: string,"low_stock_threshold"?: number | null,"product_id"?: string,"sale_price"?: number | null
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
                    "business_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"pos_department_id": string | null,"pos_item_name": string | null,"supplier_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"pos_department_id"?: string | null,"pos_item_name"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"pos_department_id"?: string | null,"pos_item_name"?: string | null,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_pos_department_id_business_id_fkey"
      columns: ["pos_department_id","business_id"]
isOneToOne: false
      referencedRelation: "pos_departments"
      referencedColumns: ["id","business_id"]
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
                },"sales_ignored_codes": {
                  Row: {
                    "business_id": string,"code": string,"code_norm": string,"created_at": string,"created_by": string | null,"item_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"code": string,"code_norm": string,"created_at"?: string,"created_by"?: string | null,"item_name"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"code"?: string,"code_norm"?: string,"created_at"?: string,"created_by"?: string | null,"item_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_ignored_codes_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_imports": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"file_name": string | null,"file_sha256": string,"first_sold_at": string | null,"id": string,"ignored_count": number,"last_sold_at": string | null,"report_date": string | null,"reverted_at": string | null,"reverted_by": string | null,"row_count": number,"skipped_count": number,"source": string,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"file_sha256": string,"first_sold_at"?: string | null,"id"?: string,"ignored_count"?: number,"last_sold_at"?: string | null,"report_date"?: string | null,"reverted_at"?: string | null,"reverted_by"?: string | null,"row_count": number,"skipped_count"?: number,"source"?: string,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"file_sha256"?: string,"first_sold_at"?: string | null,"id"?: string,"ignored_count"?: number,"last_sold_at"?: string | null,"report_date"?: string | null,"reverted_at"?: string | null,"reverted_by"?: string | null,"row_count"?: number,"skipped_count"?: number,"source"?: string,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_imports_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_imports_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"sales_lines": {
                  Row: {
                    "applied_at": string | null,"business_id": string,"code": string,"created_at": string,"external_key": string | null,"id": string,"import_id": string,"item_name": string | null,"position": number,"quantity": number,"sold_at": string | null,"source_ref": string | null,"transaction_ref": string | null,"unit_price": number | null,"variant_id": string | null,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string | null,"business_id": string,"code": string,"created_at"?: string,"external_key"?: string | null,"id"?: string,"import_id": string,"item_name"?: string | null,"position": number,"quantity": number,"sold_at"?: string | null,"source_ref"?: string | null,"transaction_ref"?: string | null,"unit_price"?: number | null,"variant_id"?: string | null,"warehouse_id": string
                  }
                  Update: {
                    "applied_at"?: string | null,"business_id"?: string,"code"?: string,"created_at"?: string,"external_key"?: string | null,"id"?: string,"import_id"?: string,"item_name"?: string | null,"position"?: number,"quantity"?: number,"sold_at"?: string | null,"source_ref"?: string | null,"transaction_ref"?: string | null,"unit_price"?: number | null,"variant_id"?: string | null,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_lines_import_id_business_id_fkey"
      columns: ["import_id","business_id"]
isOneToOne: false
      referencedRelation: "sales_imports"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_lines_variant_id_business_id_fkey"
      columns: ["variant_id","business_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_lines_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"stock_levels": {
                  Row: {
                    "business_id": string,"quantity": number,"updated_at": string,"variant_id": string,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"quantity"?: number,"updated_at"?: string,"variant_id": string,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"quantity"?: number,"updated_at"?: string,"variant_id"?: string,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_levels_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_levels_variant_id_business_id_fkey"
      columns: ["variant_id","business_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "stock_levels_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"document_id": string | null,"document_line_id": string | null,"id": string,"kind": Database["public"]['Enums']["movement_kind"],"quantity": number,"reason": string | null,"sales_line_id": string | null,"unit_cost": number | null,"variant_id": string,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"document_line_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["movement_kind"],"quantity": number,"reason"?: string | null,"sales_line_id"?: string | null,"unit_cost"?: number | null,"variant_id": string,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"document_line_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["movement_kind"],"quantity"?: number,"reason"?: string | null,"sales_line_id"?: string | null,"unit_cost"?: number | null,"variant_id"?: string,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "accounting_purchases"
      referencedColumns: ["document_id","business_id"]
    },{
      foreignKeyName: "stock_movements_document_id_business_id_fkey"
      columns: ["document_id","business_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "stock_movements_document_line_id_fkey"
      columns: ["document_line_id"]
isOneToOne: true
      referencedRelation: "document_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_sales_line_id_fkey"
      columns: ["sales_line_id"]
isOneToOne: true
      referencedRelation: "sales_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_variant_id_business_id_fkey"
      columns: ["variant_id","business_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "stock_movements_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "address": string | null,"business_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"phone": string | null,"pos_barcode_source": string,"pos_code": string | null,"pos_name": string | null,"pos_next_barcode": string | null,"price_mode": string,"price_multiplier": number | null,"tax_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"business_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"pos_barcode_source"?: string,"pos_code"?: string | null,"pos_name"?: string | null,"pos_next_barcode"?: string | null,"price_mode"?: string,"price_multiplier"?: number | null,"tax_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"pos_barcode_source"?: string,"pos_code"?: string | null,"pos_name"?: string | null,"pos_next_barcode"?: string | null,"price_mode"?: string,"price_multiplier"?: number | null,"tax_id"?: string | null
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
                    "business_id": string,"code": string,"code_norm": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["code_kind"],"supplier_id": string | null,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"code": string,"code_norm"?: never,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["code_kind"],"supplier_id"?: string | null,"variant_id": string
                  }
                  Update: {
                    "business_id"?: string,"code"?: string,"code_norm"?: never,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["code_kind"],"supplier_id"?: string | null,"variant_id"?: string
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
                },"business_integrations": {
                  Row: {
                    "account_ref": string | null,"business_id": string,"category": Database["public"]["Enums"]["integration_category"],"config": Json,"created_at": string,"credential_hint": string | null,"display_name": string,"id": string,"last_error": string | null,"last_synced_at": string | null,"mode": string,"provider": string,"status": Database["public"]["Enums"]["integration_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_ref"?: string | null,"business_id": string,"category": Database["public"]["Enums"]["integration_category"],"config"?: Json,"created_at"?: string,"credential_hint"?: string | null,"display_name": string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"mode"?: string,"provider": string,"status"?: Database["public"]["Enums"]["integration_status"],"updated_at"?: string
                  }
                  Update: {
                    "account_ref"?: string | null,"business_id"?: string,"category"?: Database["public"]["Enums"]["integration_category"],"config"?: Json,"created_at"?: string,"credential_hint"?: string | null,"display_name"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"mode"?: string,"provider"?: string,"status"?: Database["public"]["Enums"]["integration_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "business_integrations_business_id_fkey"
                      columns: ["business_id"]
                      isOneToOne: false
                      referencedRelation: "businesses"
                      referencedColumns: ["id"]
                    }
                  ]
                },"finance_accounts": {
                  Row: {
                    "account_number_last4": string | null,"account_type": string,"balance": number,"business_id": string,"created_at": string,"currency": string,"id": string,"institution": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_number_last4"?: string | null,"account_type": string,"balance"?: number,"business_id": string,"created_at"?: string,"currency"?: string,"id"?: string,"institution"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "account_number_last4"?: string | null,"account_type"?: string,"balance"?: number,"business_id"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"institution"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "finance_accounts_business_id_fkey"
                      columns: ["business_id"]
                      isOneToOne: false
                      referencedRelation: "businesses"
                      referencedColumns: ["id"]
                    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account_id": string | null,"amount": number,"business_id": string,"counterparty": string | null,"created_at": string,"due_date": string | null,"entry_date": string,"id": string,"kind": Database["public"]["Enums"]["ledger_entry_kind"],"notes": string | null,"reference_number": string | null,"status": Database["public"]["Enums"]["ledger_entry_status"],"title": string,"updated_at": string,"vat_amount": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount": number,"business_id": string,"counterparty"?: string | null,"created_at"?: string,"due_date"?: string | null,"entry_date"?: string,"id"?: string,"kind": Database["public"]["Enums"]["ledger_entry_kind"],"notes"?: string | null,"reference_number"?: string | null,"status"?: Database["public"]["Enums"]["ledger_entry_status"],"title": string,"updated_at"?: string,"vat_amount"?: number
                  }
                  Update: {
                    "account_id"?: string | null,"amount"?: number,"business_id"?: string,"counterparty"?: string | null,"created_at"?: string,"due_date"?: string | null,"entry_date"?: string,"id"?: string,"kind"?: Database["public"]["Enums"]["ledger_entry_kind"],"notes"?: string | null,"reference_number"?: string | null,"status"?: Database["public"]["Enums"]["ledger_entry_status"],"title"?: string,"updated_at"?: string,"vat_amount"?: number
                  }
                  Relationships: [
                    {
                      foreignKeyName: "ledger_entries_business_id_fkey"
                      columns: ["business_id"]
                      isOneToOne: false
                      referencedRelation: "businesses"
                      referencedColumns: ["id"]
                    },
                    {
                      foreignKeyName: "ledger_entries_account_id_business_id_fkey"
                      columns: ["account_id","business_id"]
                      isOneToOne: false
                      referencedRelation: "finance_accounts"
                      referencedColumns: ["id","business_id"]
                    }
                  ]
                },"ad_campaigns": {
                  Row: {
                    "budget": number,"business_id": string,"channel": Database["public"]["Enums"]["campaign_channel"],"conversions_count": number,"created_at": string,"end_date": string | null,"id": string,"leads_count": number,"name": string,"notes": string | null,"revenue": number,"spent": number,"start_date": string | null,"status": Database["public"]["Enums"]["campaign_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: number,"business_id": string,"channel": Database["public"]["Enums"]["campaign_channel"],"conversions_count"?: number,"created_at"?: string,"end_date"?: string | null,"id"?: string,"leads_count"?: number,"name": string,"notes"?: string | null,"revenue"?: number,"spent"?: number,"start_date"?: string | null,"status"?: Database["public"]["Enums"]["campaign_status"],"updated_at"?: string
                  }
                  Update: {
                    "budget"?: number,"business_id"?: string,"channel"?: Database["public"]["Enums"]["campaign_channel"],"conversions_count"?: number,"created_at"?: string,"end_date"?: string | null,"id"?: string,"leads_count"?: number,"name"?: string,"notes"?: string | null,"revenue"?: number,"spent"?: number,"start_date"?: string | null,"status"?: Database["public"]["Enums"]["campaign_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "ad_campaigns_business_id_fkey"
                      columns: ["business_id"]
                      isOneToOne: false
                      referencedRelation: "businesses"
                      referencedColumns: ["id"]
                    }
                  ]
                },"customers": {
                  Row: {
                    "business_id": string,"created_at": string,"email": string | null,"id": string,"lifetime_value": number,"name": string,"notes": string | null,"phone": string | null,"source": string | null,"stage": Database["public"]["Enums"]["customer_stage"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"email"?: string | null,"id"?: string,"lifetime_value"?: number,"name": string,"notes"?: string | null,"phone"?: string | null,"source"?: string | null,"stage"?: Database["public"]["Enums"]["customer_stage"],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"lifetime_value"?: number,"name"?: string,"notes"?: string | null,"phone"?: string | null,"source"?: string | null,"stage"?: Database["public"]["Enums"]["customer_stage"],"updated_at"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "customers_business_id_fkey"
                      columns: ["business_id"]
                      isOneToOne: false
                      referencedRelation: "businesses"
                      referencedColumns: ["id"]
                    }
                  ]
                },"web_connections": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"key_hint": string,"last_attempt_at": string | null,"last_error": string | null,"last_error_at": string | null,"last_ok_at": string | null,"last_orders": number | null,"platform": string,"secret_id": string,"store_url": string,"sync_from": string,"synced_until": string | null,"warehouse_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"created_by"?: string | null,"key_hint": string,"last_attempt_at"?: string | null,"last_error"?: string | null,"last_error_at"?: string | null,"last_ok_at"?: string | null,"last_orders"?: number | null,"platform"?: string,"secret_id": string,"store_url": string,"sync_from": string,"synced_until"?: string | null,"warehouse_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"key_hint"?: string,"last_attempt_at"?: string | null,"last_error"?: string | null,"last_error_at"?: string | null,"last_ok_at"?: string | null,"last_orders"?: number | null,"platform"?: string,"secret_id"?: string,"store_url"?: string,"sync_from"?: string,"synced_until"?: string | null,"warehouse_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "web_connections_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "web_connections_warehouse_id_business_id_fkey"
      columns: ["warehouse_id","business_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id","business_id"]
    }
                  ]
                }
          }
          Views: {
            "accounting_purchases": {
                  Row: {
                    "business_id": string,"doc_date": string | null,"doc_number": string | null,"doc_type": Database["public"]['Enums']["document_type"] | null,"document_id": string,"lines_net": number | null,"lines_without_cost": number | null,"printed_subtotal": number | null,"printed_total": number | null,"printed_vat": number | null,"supplier_id": string | null,"supplier_name": string | null,"vat_rate": number | null
                  }
                  ComputedFields: never
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
    }
                  ]
                }
          }
          Functions: {
            "add_member_by_email":
{ Args: { "p_business_id": string,"p_email": string,"p_role"?: Database["public"]['Enums']["member_role"] }; Returns: string
                           },
"adjust_stock":
{ Args: { "p_delta": number,"p_reason": string,"p_variant_id": string,"p_warehouse_id": string }; Returns: number
                           },
"complete_business_onboarding":
{ Args: { "p_business_id": string }; Returns: string
                           },
"approve_document":
{ Args: { "p_document_id": string }; Returns: number
                           },
"confirm_pos_export":
{ Args: { "p_export_id": string }; Returns: undefined
                           },
"create_business":
{ Args: { "p_name": string }; Returns: string
                           },
"create_pos_export":
{ Args: { "p_document_id": string,"p_rows": Json }; Returns: string
                           },
"create_product":
{ Args: { "p_business_id": string,"p_name": string,"p_notes"?: string,"p_supplier_id"?: string,"p_variants"?: Json }; Returns: string
                           },
"create_products_from_lines":
{ Args: { "p_document_id": string }; Returns: number
                           },
"delete_web_connection":
{ Args: { "p_business_id": string }; Returns: undefined
                           },
"get_web_credentials":
{ Args: { "p_business_id": string }; Returns: {
              "consumer_key": string,"consumer_secret": string,"store_url": string,"sync_from": string,"synced_until": string
            }[]
                           },
"ignore_sales_code":
{ Args: { "p_business_id": string,"p_code": string }; Returns: undefined
                           },
"import_sales":
{ Args: { "p_file_name": string,"p_fingerprint": string,"p_report_date"?: string,"p_rows": Json,"p_warehouse_id": string }; Returns: string
                           },
"match_document_lines":
{ Args: { "p_document_id": string }; Returns: undefined
                           },
"record_web_sync":
{ Args: { "p_business_id": string,"p_lines": Json,"p_orders": number,"p_synced_until": string }; Returns: number
                           },
"record_web_sync_error":
{ Args: { "p_business_id": string,"p_error": string }; Returns: undefined
                           },
"rematch_sales_lines":
{ Args: { "p_business_id": string }; Returns: number
                           },
"replace_document_lines":
{ Args: { "p_document_id": string,"p_lines": Json }; Returns: undefined
                           },
"report_pos_export_problem":
{ Args: { "p_export_id": string,"p_note": string }; Returns: undefined
                           },
"revert_sales_import":
{ Args: { "p_import_id": string }; Returns: number
                           },
"sales_report":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: {
              "amount": number,"priced": boolean,"product_id": string,"product_name": string,"supplier_id": string,"supplier_name": string,"till_units": number,"units_returned": number,"units_sold": number,"variant_id": string,"variant_label": string,"web_units": number
            }[]
                           },
"save_web_connection":
{ Args: { "p_business_id": string,"p_consumer_key": string,"p_consumer_secret": string,"p_store_url": string,"p_sync_from": string,"p_warehouse_id": string }; Returns: undefined
                           },
"search_products":
{ Args: { "p_business_id": string,"p_query"?: string }; Returns: {
              "business_id": string,
"created_at": string,
"id": string,
"name": string,
"notes": string | null,
"pos_department_id": string | null,
"pos_item_name": string | null,
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
                           },
"stock_overview":
{ Args: { "p_business_id": string }; Returns: {
              "own_threshold": boolean,"product_id": string,"product_name": string,"quantity": number,"sold_30_days": number,"state": string,"supplier_id": string,"supplier_name": string,"threshold": number,"variant_id": string,"variant_label": string
            }[]
                           },
"unignore_sales_code":
{ Args: { "p_business_id": string,"p_code": string }; Returns: undefined
                           }
          }
          Enums: {
            "campaign_channel": "meta_ads"|"google_ads"|"whatsapp"|"email"|"sms","campaign_status": "draft"|"active"|"paused"|"completed","code_kind": "barcode"|"supplier_sku"|"pos"|"web","customer_stage": "lead"|"prospect"|"active"|"vip"|"inactive","document_status": "uploaded"|"extracting"|"review"|"failed"|"approved","document_type": "delivery_note"|"tax_invoice"|"tax_invoice_receipt"|"other","integration_category": "pos_commerce"|"accounting"|"payments"|"marketing_crm","integration_status": "disconnected"|"sandbox"|"connected"|"error","ledger_entry_kind": "income"|"expense"|"invoice"|"tax_payment","ledger_entry_status": "draft"|"pending"|"paid"|"overdue","member_role": "owner"|"manager"|"staff","movement_kind": "receipt"|"adjustment"|"sale"|"return"
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
            "campaign_channel": ["meta_ads", "google_ads", "whatsapp", "email", "sms"],"campaign_status": ["draft", "active", "paused", "completed"],"code_kind": ["barcode", "supplier_sku", "pos", "web"],"customer_stage": ["lead", "prospect", "active", "vip", "inactive"],"document_status": ["uploaded", "extracting", "review", "failed", "approved"],"document_type": ["delivery_note", "tax_invoice", "tax_invoice_receipt", "other"],"integration_category": ["pos_commerce", "accounting", "payments", "marketing_crm"],"integration_status": ["disconnected", "sandbox", "connected", "error"],"ledger_entry_kind": ["income", "expense", "invoice", "tax_payment"],"ledger_entry_status": ["draft", "pending", "paid", "overdue"],"member_role": ["owner", "manager", "staff"],"movement_kind": ["receipt", "adjustment", "sale", "return"]
          }
        }
} as const
