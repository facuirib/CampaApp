export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activo: {
        Row: {
          categoria: string
          created_at: string
          created_by: string
          estado: string
          fecha_alta: string
          fecha_baja: string | null
          id: string
          motivo_baja: string | null
          nombre: string
          predio_id: string | null
          valor_origen: number
          vida_util_meses: number
        }
        Insert: {
          categoria: string
          created_at?: string
          created_by: string
          estado?: string
          fecha_alta: string
          fecha_baja?: string | null
          id?: string
          motivo_baja?: string | null
          nombre: string
          predio_id?: string | null
          valor_origen: number
          vida_util_meses: number
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string
          estado?: string
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          motivo_baja?: string | null
          nombre?: string
          predio_id?: string | null
          valor_origen?: number
          vida_util_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "activo_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      amortizacion: {
        Row: {
          activo_id: string
          asiento_id: string | null
          estado: string
          id: string
          monto: number
          periodo_id: string
        }
        Insert: {
          activo_id: string
          asiento_id?: string | null
          estado?: string
          id?: string
          monto: number
          periodo_id: string
        }
        Update: {
          activo_id?: string
          asiento_id?: string | null
          estado?: string
          id?: string
          monto?: number
          periodo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amortizacion_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
        ]
      }
      anticipo: {
        Row: {
          asiento_id: string | null
          created_at: string
          fecha: string
          id: string
          monto: number
          pago_id: string
          tercero_id: string
        }
        Insert: {
          asiento_id?: string | null
          created_at?: string
          fecha: string
          id?: string
          monto: number
          pago_id: string
          tercero_id: string
        }
        Update: {
          asiento_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          pago_id?: string
          tercero_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anticipo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "anticipo_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      anticipo_uso: {
        Row: {
          anticipo_id: string
          asiento_id: string | null
          cuota_id: string
          fecha: string
          id: string
          monto: number
        }
        Insert: {
          anticipo_id: string
          asiento_id?: string | null
          cuota_id: string
          fecha?: string
          id?: string
          monto: number
        }
        Update: {
          anticipo_id?: string
          asiento_id?: string | null
          cuota_id?: string
          fecha?: string
          id?: string
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "anticipo_uso_anticipo_id_fkey"
            columns: ["anticipo_id"]
            isOneToOne: false
            referencedRelation: "anticipo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_uso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_uso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "anticipo_uso_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_uso_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "anticipo_uso_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_estado_cuota"
            referencedColumns: ["id"]
          },
        ]
      }
      arqueo: {
        Row: {
          asiento_id: string | null
          created_at: string
          diferencia: number | null
          id: string
          jornada_id: string
          predio_id: string
          responsable_id: string
          saldo_contado: number
          saldo_sistema: number
        }
        Insert: {
          asiento_id?: string | null
          created_at?: string
          diferencia?: number | null
          id?: string
          jornada_id: string
          predio_id: string
          responsable_id: string
          saldo_contado: number
          saldo_sistema: number
        }
        Update: {
          asiento_id?: string | null
          created_at?: string
          diferencia?: number | null
          id?: string
          jornada_id?: string
          predio_id?: string
          responsable_id?: string
          saldo_contado?: number
          saldo_sistema?: number
        }
        Relationships: [
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      asiento: {
        Row: {
          anulado_por: string | null
          created_at: string
          created_by: string
          descripcion: string
          fecha: string
          id: string
          jornada_id: string | null
          origen: string
          origen_id: string | null
          periodo_id: string
          predio_id: string | null
          torneo_id: string | null
        }
        Insert: {
          anulado_por?: string | null
          created_at?: string
          created_by: string
          descripcion: string
          fecha: string
          id?: string
          jornada_id?: string | null
          origen: string
          origen_id?: string | null
          periodo_id: string
          predio_id?: string | null
          torneo_id?: string | null
        }
        Update: {
          anulado_por?: string | null
          created_at?: string
          created_by?: string
          descripcion?: string
          fecha?: string
          id?: string
          jornada_id?: string | null
          origen?: string
          origen_id?: string | null
          periodo_id?: string
          predio_id?: string | null
          torneo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asiento_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "asiento_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      asiento_linea: {
        Row: {
          asiento_id: string
          cuenta_id: string
          debe: number
          haber: number
          id: string
          tercero_id: string | null
        }
        Insert: {
          asiento_id: string
          cuenta_id: string
          debe?: number
          haber?: number
          id?: string
          tercero_id?: string | null
        }
        Update: {
          asiento_id?: string
          cuenta_id?: string
          debe?: number
          haber?: number
          id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "asiento_linea_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          anterior: Json | null
          created_at: string
          id: number
          nuevo: Json | null
          operacion: string
          registro_id: string
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          anterior?: Json | null
          created_at?: string
          id?: number
          nuevo?: Json | null
          operacion: string
          registro_id: string
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          anterior?: Json | null
          created_at?: string
          id?: number
          nuevo?: Json | null
          operacion?: string
          registro_id?: string
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      caja: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          predio_id: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          predio_id?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          predio_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_gasto: {
        Row: {
          activo: boolean
          area: string
          cuenta_id: string
          id: string
          imputacion_default: string
          naturaleza: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          area: string
          cuenta_id: string
          id?: string
          imputacion_default?: string
          naturaleza: string
          nombre: string
        }
        Update: {
          activo?: boolean
          area?: string
          cuenta_id?: string
          id?: string
          imputacion_default?: string
          naturaleza?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_gasto_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuenta"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria: {
        Row: {
          genero: Database["public"]["Enums"]["genero"]
          id: string
          nombre: string
          orden: number | null
          torneo_id: string
        }
        Insert: {
          genero: Database["public"]["Enums"]["genero"]
          id?: string
          nombre: string
          orden?: number | null
          torneo_id: string
        }
        Update: {
          genero?: Database["public"]["Enums"]["genero"]
          id?: string
          nombre?: string
          orden?: number | null
          torneo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      cheque: {
        Row: {
          asiento_alta_id: string | null
          asiento_cierre_id: string | null
          banco: string | null
          created_at: string
          estado: string
          fecha_cobro: string
          fecha_emision: string
          fecha_estado: string | null
          id: string
          monto: number
          numero: string | null
          observaciones: string | null
          sentido: string
          tercero_id: string | null
        }
        Insert: {
          asiento_alta_id?: string | null
          asiento_cierre_id?: string | null
          banco?: string | null
          created_at?: string
          estado?: string
          fecha_cobro: string
          fecha_emision: string
          fecha_estado?: string | null
          id?: string
          monto: number
          numero?: string | null
          observaciones?: string | null
          sentido: string
          tercero_id?: string | null
        }
        Update: {
          asiento_alta_id?: string | null
          asiento_cierre_id?: string | null
          banco?: string | null
          created_at?: string
          estado?: string
          fecha_cobro?: string
          fecha_emision?: string
          fecha_estado?: string | null
          id?: string
          monto?: number
          numero?: string | null
          observaciones?: string | null
          sentido?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheque_asiento_alta_id_fkey"
            columns: ["asiento_alta_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_asiento_alta_id_fkey"
            columns: ["asiento_alta_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cheque_asiento_cierre_id_fkey"
            columns: ["asiento_cierre_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_asiento_cierre_id_fkey"
            columns: ["asiento_cierre_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      compromiso: {
        Row: {
          asiento_id: string | null
          cheque_id: string | null
          created_at: string
          cumplido_at: string | null
          descripcion: string
          estado: string
          gasto_id: string | null
          id: string
          monto: number
          plan_id: string | null
          sentido: string
          tercero_id: string | null
          tipo: string
          torneo_id: string | null
          vence_at: string
        }
        Insert: {
          asiento_id?: string | null
          cheque_id?: string | null
          created_at?: string
          cumplido_at?: string | null
          descripcion: string
          estado?: string
          gasto_id?: string | null
          id?: string
          monto: number
          plan_id?: string | null
          sentido: string
          tercero_id?: string | null
          tipo: string
          torneo_id?: string | null
          vence_at: string
        }
        Update: {
          asiento_id?: string | null
          cheque_id?: string | null
          created_at?: string
          cumplido_at?: string | null
          descripcion?: string
          estado?: string
          gasto_id?: string | null
          id?: string
          monto?: number
          plan_id?: string | null
          sentido?: string
          tercero_id?: string | null
          tipo?: string
          torneo_id?: string | null
          vence_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromiso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "compromiso_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      concepto_gasto: {
        Row: {
          activo: boolean
          arancel_ref: number | null
          cat_gasto_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          arancel_ref?: number | null
          cat_gasto_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          arancel_ref?: number | null
          cat_gasto_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepto_gasto_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
            referencedColumns: ["id"]
          },
        ]
      }
      config_contable: {
        Row: {
          id: string
          umbral_activacion: number
          updated_at: string
          updated_by: string | null
          vigente_desde: string
        }
        Insert: {
          id?: string
          umbral_activacion?: number
          updated_at?: string
          updated_by?: string | null
          vigente_desde?: string
        }
        Update: {
          id?: string
          umbral_activacion?: number
          updated_at?: string
          updated_by?: string | null
          vigente_desde?: string
        }
        Relationships: []
      }
      cuenta: {
        Row: {
          codigo: string
          id: string
          imputable: boolean
          nombre: string
          padre_id: string | null
          tipo: string
        }
        Insert: {
          codigo: string
          id?: string
          imputable?: boolean
          nombre: string
          padre_id?: string | null
          tipo: string
        }
        Update: {
          codigo?: string
          id?: string
          imputable?: boolean
          nombre?: string
          padre_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "cuenta"
            referencedColumns: ["id"]
          },
        ]
      }
      cuota: {
        Row: {
          equipo_torneo_id: string
          id: string
          jornada_id: string | null
          monto: number
          numero: number
          pagado_at: string | null
          plan_tarifa_linea_id: string
          vence_at: string
        }
        Insert: {
          equipo_torneo_id: string
          id?: string
          jornada_id?: string | null
          monto: number
          numero: number
          pagado_at?: string | null
          plan_tarifa_linea_id: string
          vence_at: string
        }
        Update: {
          equipo_torneo_id?: string
          id?: string
          jornada_id?: string | null
          monto?: number
          numero?: number
          pagado_at?: string | null
          plan_tarifa_linea_id?: string
          vence_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "equipo_torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "cuota_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_plan_tarifa_linea_id_fkey"
            columns: ["plan_tarifa_linea_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa_linea"
            referencedColumns: ["id"]
          },
        ]
      }
      ejercicio: {
        Row: {
          anio: number
          estado: string
          fecha_desde: string
          fecha_hasta: string
          id: string
        }
        Insert: {
          anio: number
          estado?: string
          fecha_desde: string
          fecha_hasta: string
          id?: string
        }
        Update: {
          anio?: number
          estado?: string
          fecha_desde?: string
          fecha_hasta?: string
          id?: string
        }
        Relationships: []
      }
      envio: {
        Row: {
          destinatario: string
          enviado_at: string
          enviado_por: string | null
          id: string
          payload: Json | null
          plantilla: string
          tercero_id: string
        }
        Insert: {
          destinatario: string
          enviado_at?: string
          enviado_por?: string | null
          id?: string
          payload?: Json | null
          plantilla: string
          tercero_id: string
        }
        Update: {
          destinatario?: string
          enviado_at?: string
          enviado_por?: string | null
          id?: string
          payload?: Json | null
          plantilla?: string
          tercero_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      equipo_torneo: {
        Row: {
          id: string
          medio_previsto: Database["public"]["Enums"]["medio_pago"]
          plan_inscripcion_id: string
          plan_partidos_id: string
          responsable_id: string | null
          serie_id: string
          tercero_id: string
          torneo_id: string
          total_facturado: number
        }
        Insert: {
          id?: string
          medio_previsto: Database["public"]["Enums"]["medio_pago"]
          plan_inscripcion_id: string
          plan_partidos_id: string
          responsable_id?: string | null
          serie_id: string
          tercero_id: string
          torneo_id: string
          total_facturado?: number
        }
        Update: {
          id?: string
          medio_previsto?: Database["public"]["Enums"]["medio_pago"]
          plan_inscripcion_id?: string
          plan_partidos_id?: string
          responsable_id?: string | null
          serie_id?: string
          tercero_id?: string
          torneo_id?: string
          total_facturado?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipo_torneo_plan_inscripcion_id_fkey"
            columns: ["plan_inscripcion_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_plan_partidos_id_fkey"
            columns: ["plan_partidos_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      escenario: {
        Row: {
          ajuste_gastos_pct: number
          created_at: string
          demora_cobro_dias: number
          ejercicio_id: string
          equipos_proyectados: number | null
          es_base: boolean
          id: string
          nombre: string
          tasa_cobranza: number
        }
        Insert: {
          ajuste_gastos_pct?: number
          created_at?: string
          demora_cobro_dias?: number
          ejercicio_id: string
          equipos_proyectados?: number | null
          es_base?: boolean
          id?: string
          nombre: string
          tasa_cobranza?: number
        }
        Update: {
          ajuste_gastos_pct?: number
          created_at?: string
          demora_cobro_dias?: number
          ejercicio_id?: string
          equipos_proyectados?: number | null
          es_base?: boolean
          id?: string
          nombre?: string
          tasa_cobranza?: number
        }
        Relationships: [
          {
            foreignKeyName: "escenario_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicio"
            referencedColumns: ["id"]
          },
        ]
      }
      gasto: {
        Row: {
          activo_id: string | null
          arancel: number
          asiento_dev_id: string | null
          asiento_pag_id: string | null
          cantidad: number
          cat_gasto_id: string
          concepto_id: string | null
          concepto_libre: string | null
          devengado_at: string
          id: string
          jornada_id: string | null
          medio_pago: string | null
          pagado_at: string | null
          predio_id: string | null
          torneo_id: string | null
          total: number | null
        }
        Insert: {
          activo_id?: string | null
          arancel: number
          asiento_dev_id?: string | null
          asiento_pag_id?: string | null
          cantidad?: number
          cat_gasto_id: string
          concepto_id?: string | null
          concepto_libre?: string | null
          devengado_at: string
          id?: string
          jornada_id?: string | null
          medio_pago?: string | null
          pagado_at?: string | null
          predio_id?: string | null
          torneo_id?: string | null
          total?: number | null
        }
        Update: {
          activo_id?: string | null
          arancel?: number
          asiento_dev_id?: string | null
          asiento_pag_id?: string | null
          cantidad?: number
          cat_gasto_id?: string
          concepto_id?: string | null
          concepto_libre?: string | null
          devengado_at?: string
          id?: string
          jornada_id?: string | null
          medio_pago?: string | null
          pagado_at?: string | null
          predio_id?: string | null
          torneo_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_asiento_dev_id_fkey"
            columns: ["asiento_dev_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_asiento_dev_id_fkey"
            columns: ["asiento_dev_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "gasto_asiento_pag_id_fkey"
            columns: ["asiento_pag_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_asiento_pag_id_fkey"
            columns: ["asiento_pag_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "gasto_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "concepto_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      jornada: {
        Row: {
          cantidad_esperada: number | null
          es_playoff: boolean
          estado: string
          fecha: string | null
          id: string
          instancia: string | null
          numero: number | null
          reprograma_a: string | null
          serie_id: string
        }
        Insert: {
          cantidad_esperada?: number | null
          es_playoff?: boolean
          estado?: string
          fecha?: string | null
          id?: string
          instancia?: string | null
          numero?: number | null
          reprograma_a?: string | null
          serie_id: string
        }
        Update: {
          cantidad_esperada?: number | null
          es_playoff?: boolean
          estado?: string
          fecha?: string | null
          id?: string
          instancia?: string | null
          numero?: number | null
          reprograma_a?: string | null
          serie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_reprograma_a_fkey"
            columns: ["reprograma_a"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_fondo: {
        Row: {
          asiento_id: string | null
          caja_id: string
          created_at: string
          created_by: string
          fecha: string
          id: string
          monto: number
          motivo: string | null
          tipo: string
          torneo_id: string | null
        }
        Insert: {
          asiento_id?: string | null
          caja_id: string
          created_at?: string
          created_by: string
          fecha: string
          id?: string
          monto: number
          motivo?: string | null
          tipo: string
          torneo_id?: string | null
        }
        Update: {
          asiento_id?: string | null
          caja_id?: string
          created_at?: string
          created_by?: string
          fecha?: string
          id?: string
          monto?: number
          motivo?: string | null
          tipo?: string
          torneo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_fondo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_fondo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_fondo_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_caja"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      pago: {
        Row: {
          asiento_id: string | null
          created_at: string
          cuota_id: string | null
          fecha: string
          id: string
          jornada_id: string | null
          medio_pago: string
          monto: number
          predio_id: string | null
          registrado_por: string
          tercero_id: string
        }
        Insert: {
          asiento_id?: string | null
          created_at?: string
          cuota_id?: string | null
          fecha: string
          id?: string
          jornada_id?: string | null
          medio_pago: string
          monto: number
          predio_id?: string | null
          registrado_por: string
          tercero_id: string
        }
        Update: {
          asiento_id?: string | null
          created_at?: string
          cuota_id?: string | null
          fecha?: string
          id?: string
          jornada_id?: string | null
          medio_pago?: string
          monto?: number
          predio_id?: string | null
          registrado_por?: string
          tercero_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "pago_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "pago_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_estado_cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      pago_imputacion: {
        Row: {
          cuota_id: string
          id: string
          monto: number
          pago_id: string
        }
        Insert: {
          cuota_id: string
          id?: string
          monto: number
          pago_id: string
        }
        Update: {
          cuota_id?: string
          id?: string
          monto?: number
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_imputacion_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_imputacion_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "pago_imputacion_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "v_estado_cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_imputacion_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
        ]
      }
      periodo: {
        Row: {
          anio: number
          cerrado_at: string | null
          cerrado_por: string | null
          ejercicio_id: string
          estado: string
          id: string
          mes: number
        }
        Insert: {
          anio: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          ejercicio_id: string
          estado?: string
          id?: string
          mes: number
        }
        Update: {
          anio?: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          ejercicio_id?: string
          estado?: string
          id?: string
          mes?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodo_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicio"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pago: {
        Row: {
          cuotas_total: number
          dia_vencimiento: number
          estado: string
          fecha_inicio: string
          id: string
          indexado: boolean
          monto_cuota: number
          nombre: string
          organismo: string | null
        }
        Insert: {
          cuotas_total: number
          dia_vencimiento?: number
          estado?: string
          fecha_inicio: string
          id?: string
          indexado?: boolean
          monto_cuota: number
          nombre: string
          organismo?: string | null
        }
        Update: {
          cuotas_total?: number
          dia_vencimiento?: number
          estado?: string
          fecha_inicio?: string
          id?: string
          indexado?: boolean
          monto_cuota?: number
          nombre?: string
          organismo?: string | null
        }
        Relationships: []
      }
      plan_tarifa: {
        Row: {
          activo: boolean
          concepto: Database["public"]["Enums"]["concepto_pago"]
          created_at: string
          genero: Database["public"]["Enums"]["genero"]
          id: string
          opcion_nombre: string
          opcion_orden: number
          torneo_id: string
        }
        Insert: {
          activo?: boolean
          concepto: Database["public"]["Enums"]["concepto_pago"]
          created_at?: string
          genero: Database["public"]["Enums"]["genero"]
          id?: string
          opcion_nombre: string
          opcion_orden: number
          torneo_id: string
        }
        Update: {
          activo?: boolean
          concepto?: Database["public"]["Enums"]["concepto_pago"]
          created_at?: string
          genero?: Database["public"]["Enums"]["genero"]
          id?: string
          opcion_nombre?: string
          opcion_orden?: number
          torneo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      plan_tarifa_linea: {
        Row: {
          cantidad_esperada: number | null
          concepto_label: string
          created_at: string
          es_playoff: boolean
          fecha_desde: number | null
          fecha_hasta: number | null
          fecha_referencia: string | null
          hito_jornada_id: string | null
          id: string
          linea_orden: number
          observacion: string | null
          plan_tarifa_id: string
          precio_efectivo: number
          precio_transferencia: number
          regla: Database["public"]["Enums"]["regla_vencimiento"]
        }
        Insert: {
          cantidad_esperada?: number | null
          concepto_label: string
          created_at?: string
          es_playoff?: boolean
          fecha_desde?: number | null
          fecha_hasta?: number | null
          fecha_referencia?: string | null
          hito_jornada_id?: string | null
          id?: string
          linea_orden: number
          observacion?: string | null
          plan_tarifa_id: string
          precio_efectivo: number
          precio_transferencia: number
          regla: Database["public"]["Enums"]["regla_vencimiento"]
        }
        Update: {
          cantidad_esperada?: number | null
          concepto_label?: string
          created_at?: string
          es_playoff?: boolean
          fecha_desde?: number | null
          fecha_hasta?: number | null
          fecha_referencia?: string | null
          hito_jornada_id?: string | null
          id?: string
          linea_orden?: number
          observacion?: string | null
          plan_tarifa_id?: string
          precio_efectivo?: number
          precio_transferencia?: number
          regla?: Database["public"]["Enums"]["regla_vencimiento"]
        }
        Relationships: [
          {
            foreignKeyName: "plan_tarifa_linea_hito_jornada_id_fkey"
            columns: ["hito_jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tarifa_linea_plan_tarifa_id_fkey"
            columns: ["plan_tarifa_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_mail: {
        Row: {
          asunto: string
          clave: string
          cuerpo: string
          id: string
        }
        Insert: {
          asunto: string
          clave: string
          cuerpo: string
          id?: string
        }
        Update: {
          asunto?: string
          clave?: string
          cuerpo?: string
          id?: string
        }
        Relationships: []
      }
      predio: {
        Row: {
          activo: boolean
          codigo: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      presupuesto: {
        Row: {
          ejercicio_id: string
          estado: string
          id: string
          torneo_id: string | null
        }
        Insert: {
          ejercicio_id: string
          estado?: string
          id?: string
          torneo_id?: string | null
        }
        Update: {
          ejercicio_id?: string
          estado?: string
          id?: string
          torneo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      presupuesto_linea: {
        Row: {
          base: number
          cantidad: number
          cat_gasto_id: string
          concepto_id: string | null
          id: string
          presupuesto_id: string
          unidad: string
        }
        Insert: {
          base: number
          cantidad?: number
          cat_gasto_id: string
          concepto_id?: string | null
          id?: string
          presupuesto_id: string
          unidad: string
        }
        Update: {
          base?: number
          cantidad?: number
          cat_gasto_id?: string
          concepto_id?: string | null
          id?: string
          presupuesto_id?: string
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_linea_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_linea_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "concepto_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_linea_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuesto"
            referencedColumns: ["id"]
          },
        ]
      }
      serie: {
        Row: {
          categoria_id: string
          id: string
          nombre: string
          orden: number | null
        }
        Insert: {
          categoria_id: string
          id?: string
          nombre: string
          orden?: number | null
        }
        Update: {
          categoria_id?: string
          id?: string
          nombre?: string
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "serie_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria"
            referencedColumns: ["id"]
          },
        ]
      }
      tercero: {
        Row: {
          activo: boolean
          contacto: string | null
          email: string | null
          id: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          contacto?: string | null
          email?: string | null
          id?: string
          nombre: string
          tipo: string
        }
        Update: {
          activo?: boolean
          contacto?: string | null
          email?: string | null
          id?: string
          nombre?: string
          tipo?: string
        }
        Relationships: []
      }
      torneo: {
        Row: {
          activo: boolean
          anio: number
          ejercicio_id: string | null
          estado: string
          fecha_desde: string | null
          fecha_hasta: string | null
          id: string
          nombre: string
          temporada: Database["public"]["Enums"]["temporada"]
        }
        Insert: {
          activo?: boolean
          anio: number
          ejercicio_id?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          id?: string
          nombre: string
          temporada: Database["public"]["Enums"]["temporada"]
        }
        Update: {
          activo?: boolean
          anio?: number
          ejercicio_id?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          id?: string
          nombre?: string
          temporada?: Database["public"]["Enums"]["temporada"]
        }
        Relationships: [
          {
            foreignKeyName: "torneo_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicio"
            referencedColumns: ["id"]
          },
        ]
      }
      usd_operacion: {
        Row: {
          asiento_id: string | null
          cantidad: number
          fecha: string
          id: string
          monto_pesos: number
          motivo: string | null
          tc: number
          tipo: string
        }
        Insert: {
          asiento_id?: string | null
          cantidad: number
          fecha: string
          id?: string
          monto_pesos: number
          motivo?: string | null
          tc: number
          tipo: string
        }
        Update: {
          asiento_id?: string | null
          cantidad?: number
          fecha?: string
          id?: string
          monto_pesos?: number
          motivo?: string | null
          tc?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "usd_operacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usd_operacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
        ]
      }
    }
    Views: {
      v_anticipo_saldo: {
        Row: {
          equipo: string | null
          saldo_disponible: number | null
          tercero_id: string | null
          total_anticipado: number | null
          total_usado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
        ]
      }
      v_asiento_detalle: {
        Row: {
          asiento: string | null
          asiento_id: string | null
          cuenta: string | null
          cuenta_codigo: string | null
          cuenta_tipo: string | null
          debe: number | null
          fecha: string | null
          haber: number | null
          tercero: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
        ]
      }
      v_calendario_pagos: {
        Row: {
          criticidad: string | null
          descripcion: string | null
          estado: string | null
          fecha: string | null
          monto: number | null
          sentido: string | null
          tercero: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_cobranza_kpi: {
        Row: {
          cobrado: number | null
          devengado: number | null
          dias_promedio_cobro: number | null
          nombre: string | null
          por_vencer: number | null
          tasa_cobranza: number | null
          torneo_id: string | null
          vencido: number | null
        }
        Relationships: []
      }
      v_comparador_torneos: {
        Row: {
          contribucion: number | null
          contribucion_por_equipo: number | null
          costos_directos: number | null
          equipos: number | null
          fecha_desde: string | null
          ingresos: number | null
          nombre: string | null
        }
        Relationships: []
      }
      v_cuenta_corriente_equipo: {
        Row: {
          categoria: string | null
          cuotas_pagadas: number | null
          cuotas_total: number | null
          equipo: string | null
          equipo_torneo_id: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          proximo_vencimiento: string | null
          saldo: number | null
          serie: string | null
          tercero_id: string | null
          torneo: string | null
          total_facturado: number | null
          total_pagado: number | null
        }
        Relationships: []
      }
      v_dependencia_fondo: {
        Row: {
          colocado: number | null
          mes: string | null
          neto: number | null
          rescatado: number | null
        }
        Relationships: []
      }
      v_deuda_detalle: {
        Row: {
          categoria: string | null
          cuota_id: string | null
          cuota_numero: number | null
          dias_atraso: number | null
          equipo: string | null
          equipo_torneo_id: string | null
          estado: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          monto: number | null
          pagado: number | null
          pagado_at: string | null
          pagado_con_anticipo: number | null
          saldo: number | null
          serie: string | null
          tercero_id: string | null
          torneo: string | null
          torneo_estado: string | null
          torneo_id: string | null
          vence_at: string | null
        }
        Relationships: []
      }
      v_deuda_equipo: {
        Row: {
          deuda_total: number | null
          deuda_vencida: number | null
          email: string | null
          equipo: string | null
          saldo_a_favor: number | null
          tercero_id: string | null
          torneos_con_deuda: number | null
          vencimiento_mas_antiguo: string | null
        }
        Relationships: []
      }
      v_estado_cuota: {
        Row: {
          equipo_torneo_id: string | null
          estado: string | null
          id: string | null
          monto: number | null
          numero: number | null
          pagado: number | null
          pagado_at: string | null
          saldo: number | null
          vence_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "equipo_torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["equipo_torneo_id"]
          },
        ]
      }
      v_libro_diario: {
        Row: {
          anio: number | null
          anulado: boolean | null
          asiento_id: string | null
          created_at: string | null
          descripcion: string | null
          fecha: string | null
          jornada: number | null
          lineas: number | null
          mes: number | null
          origen: string | null
          origen_id: string | null
          periodo_estado: string | null
          predio: string | null
          torneo: string | null
          total_debe: number | null
          total_haber: number | null
        }
        Relationships: []
      }
      v_presupuesto_total: {
        Row: {
          base: number | null
          cantidad: number | null
          cat_gasto_id: string | null
          concepto_id: string | null
          ejercicio_id: string | null
          id: string | null
          presupuesto_id: string | null
          torneo_id: string | null
          total_presupuestado: number | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_linea_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_linea_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "concepto_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_linea_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuesto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_resultado_producto: {
        Row: {
          anio: number | null
          contribucion: number | null
          egresos: number | null
          ingresos: number | null
          producto: string | null
        }
        Relationships: []
      }
      v_saldo_caja: {
        Row: {
          caja_id: string | null
          nombre: string | null
          predio: string | null
          predio_id: string | null
          saldo: number | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      anular_asiento: {
        Args: { p_asiento_id: string; p_fecha?: string; p_motivo: string }
        Returns: string
      }
      aplicar_anticipo: {
        Args: { p_cuota_id: string; p_monto: number; p_tercero_id: string }
        Returns: number
      }
      crear_asiento: {
        Args: {
          p_created_by?: string
          p_descripcion: string
          p_fecha: string
          p_jornada_id?: string
          p_lineas: Json
          p_origen: string
          p_origen_id?: string
          p_predio_id?: string
          p_torneo_id?: string
        }
        Returns: string
      }
      crear_equipo_torneo: {
        Args: {
          p_medio_previsto: Database["public"]["Enums"]["medio_pago"]
          p_plan_inscripcion_id: string
          p_plan_partidos_id: string
          p_responsable_id?: string
          p_serie_id: string
          p_tercero_id: string
        }
        Returns: string
      }
      generar_cuotas_plan: { Args: { p_plan_id: string }; Returns: number }
      generar_grilla_liga: {
        Args: {
          p_fechas_fem?: number
          p_fechas_masc?: number
          p_torneo_id: string
        }
        Returns: number
      }
      imputar_pago: {
        Args: { p_imputaciones: Json; p_pago_id: string }
        Returns: number
      }
      imputar_pago_automatico: { Args: { p_pago_id: string }; Returns: number }
      periodo_de_fecha: { Args: { p_fecha: string }; Returns: string }
      proponer_amortizaciones: {
        Args: { p_periodo_id: string }
        Returns: {
          activo_id: string
          cuota: number
          cuotas_total: number
          monto: number
          nombre: string
        }[]
      }
      registrar_cobro: {
        Args: {
          p_fecha: string
          p_imputaciones: Json
          p_medio: string
          p_monto: number
          p_predio_id?: string
          p_responsable_id?: string
          p_tercero_id: string
        }
        Returns: string
      }
      saldo_cuenta: {
        Args: { p_codigo: string; p_hasta?: string; p_torneo_id?: string }
        Returns: number
      }
      sugerir_imputacion: { Args: { p_pago_id: string }; Returns: Json }
    }
    Enums: {
      concepto_pago: "inscripcion" | "partidos"
      genero: "masculino" | "femenino"
      medio_pago: "efectivo" | "transferencia"
      regla_vencimiento: "fecha_fija" | "por_partido" | "bloque_adelantado"
      temporada: "apertura" | "clausura"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      concepto_pago: ["inscripcion", "partidos"],
      genero: ["masculino", "femenino"],
      medio_pago: ["efectivo", "transferencia"],
      regla_vencimiento: ["fecha_fija", "por_partido", "bloque_adelantado"],
      temporada: ["apertura", "clausura"],
    },
  },
} as const
