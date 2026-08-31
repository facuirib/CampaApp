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
      _prueba_marca: {
        Row: {
          id: string
          tipo: string
        }
        Insert: {
          id: string
          tipo: string
        }
        Update: {
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      activo: {
        Row: {
          categoria: string
          created_at: string
          created_by: string
          descripcion: string | null
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
          descripcion?: string | null
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
          descripcion?: string | null
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
            foreignKeyName: "amortizacion_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "v_activo"
            referencedColumns: ["activo_id"]
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
            foreignKeyName: "amortizacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
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
            foreignKeyName: "anticipo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            foreignKeyName: "anticipo_uso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
      arca_ticket_acceso: {
        Row: {
          expira_at: string
          produccion: boolean
          servicio: string
          sign: string
          token: string
          updated_at: string
        }
        Insert: {
          expira_at: string
          produccion: boolean
          servicio: string
          sign: string
          token: string
          updated_at?: string
        }
        Update: {
          expira_at?: string
          produccion?: boolean
          servicio?: string
          sign?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      arqueo: {
        Row: {
          ambito: string
          anulado_at: string | null
          anulado_motivo: string | null
          asiento_ajuste_id: string | null
          asiento_entrega_id: string | null
          created_at: string
          dia_cancha_id: string
          diferencia: number | null
          entregado_at: string | null
          estado: string
          id: string
          responsable_id: string
          saldo_contado: number
          saldo_sistema: number
        }
        Insert: {
          ambito?: string
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_ajuste_id?: string | null
          asiento_entrega_id?: string | null
          created_at?: string
          dia_cancha_id: string
          diferencia?: number | null
          entregado_at?: string | null
          estado?: string
          id?: string
          responsable_id: string
          saldo_contado: number
          saldo_sistema: number
        }
        Update: {
          ambito?: string
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_ajuste_id?: string | null
          asiento_entrega_id?: string | null
          created_at?: string
          dia_cancha_id?: string
          diferencia?: number | null
          entregado_at?: string | null
          estado?: string
          id?: string
          responsable_id?: string
          saldo_contado?: number
          saldo_sistema?: number
        }
        Relationships: [
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "dia_cancha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_bar"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "arqueo_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_torneo"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "arqueo_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_bar_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "arqueo_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_efectivo_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
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
            foreignKeyName: "asiento_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "asiento_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
          },
          {
            foreignKeyName: "asiento_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "asiento_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "asiento_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "asiento_linea_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "asiento_linea_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual_item"
            referencedColumns: ["cuenta_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "asiento_linea_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
          cuenta_id: string
          id: string
          nombre: string
          predio_id: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          cuenta_id: string
          id?: string
          nombre: string
          predio_id?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          cuenta_id?: string
          id?: string
          nombre?: string
          predio_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "caja_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual_item"
            referencedColumns: ["cuenta_id"]
          },
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
          unidad_default: string
        }
        Insert: {
          activo?: boolean
          area: string
          cuenta_id: string
          id?: string
          imputacion_default?: string
          naturaleza: string
          nombre: string
          unidad_default: string
        }
        Update: {
          activo?: boolean
          area?: string
          cuenta_id?: string
          id?: string
          imputacion_default?: string
          naturaleza?: string
          nombre?: string
          unidad_default?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_gasto_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_gasto_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "cat_gasto_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual_item"
            referencedColumns: ["cuenta_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
          gasto_id: string | null
          id: string
          monto: number
          numero: string | null
          observaciones: string | null
          pago_id: string | null
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
          gasto_id?: string | null
          id?: string
          monto: number
          numero?: string | null
          observaciones?: string | null
          pago_id?: string | null
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
          gasto_id?: string | null
          id?: string
          monto?: number
          numero?: string | null
          observaciones?: string | null
          pago_id?: string | null
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
            foreignKeyName: "cheque_asiento_alta_id_fkey"
            columns: ["asiento_alta_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "cheque_asiento_cierre_id_fkey"
            columns: ["asiento_cierre_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cheque_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "v_gasto_detalle"
            referencedColumns: ["gasto_id"]
          },
          {
            foreignKeyName: "cheque_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cheque_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      comprobante: {
        Row: {
          cae: string | null
          cae_vencimiento: string | null
          condicion_iva_receptor_id: number
          cotizacion: number
          created_at: string
          cuota_cobro_sponsor_id: string | null
          detalle: string | null
          emisor_domicilio: string | null
          emitida_por: string | null
          error_detalle: string | null
          estado: string
          fecha_emision: string
          id: string
          iva: number | null
          moneda: string
          monto: number
          motivo_sin_origen: string | null
          neto: number | null
          numero: number
          pago_id: string | null
          punto_venta: number
          receptor_doc_nro: string | null
          receptor_doc_tipo: number | null
          receptor_domicilio: string | null
          receptor_nombre: string | null
          sin_origen: boolean
          tipo_cod_aut: string
          tipo_comprobante: number
        }
        Insert: {
          cae?: string | null
          cae_vencimiento?: string | null
          condicion_iva_receptor_id: number
          cotizacion?: number
          created_at?: string
          cuota_cobro_sponsor_id?: string | null
          detalle?: string | null
          emisor_domicilio?: string | null
          emitida_por?: string | null
          error_detalle?: string | null
          estado?: string
          fecha_emision?: string
          id?: string
          iva?: number | null
          moneda?: string
          monto: number
          motivo_sin_origen?: string | null
          neto?: number | null
          numero: number
          pago_id?: string | null
          punto_venta: number
          receptor_doc_nro?: string | null
          receptor_doc_tipo?: number | null
          receptor_domicilio?: string | null
          receptor_nombre?: string | null
          sin_origen?: boolean
          tipo_cod_aut?: string
          tipo_comprobante: number
        }
        Update: {
          cae?: string | null
          cae_vencimiento?: string | null
          condicion_iva_receptor_id?: number
          cotizacion?: number
          created_at?: string
          cuota_cobro_sponsor_id?: string | null
          detalle?: string | null
          emisor_domicilio?: string | null
          emitida_por?: string | null
          error_detalle?: string | null
          estado?: string
          fecha_emision?: string
          id?: string
          iva?: number | null
          moneda?: string
          monto?: number
          motivo_sin_origen?: string | null
          neto?: number | null
          numero?: number
          pago_id?: string | null
          punto_venta?: number
          receptor_doc_nro?: string | null
          receptor_doc_tipo?: number | null
          receptor_domicilio?: string | null
          receptor_nombre?: string | null
          sin_origen?: boolean
          tipo_cod_aut?: string
          tipo_comprobante?: number
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_condicion_iva_fk"
            columns: ["condicion_iva_receptor_id"]
            isOneToOne: false
            referencedRelation: "condicion_iva_receptor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "cuota_cobro_sponsor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor_futuras"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "factura_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
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
            foreignKeyName: "compromiso_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "compromiso_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "v_cheque"
            referencedColumns: ["cheque_id"]
          },
          {
            foreignKeyName: "compromiso_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "v_gasto_detalle"
            referencedColumns: ["gasto_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "compromiso_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "compromiso_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
          unidad_default: string | null
        }
        Insert: {
          activo?: boolean
          arancel_ref?: number | null
          cat_gasto_id: string
          id?: string
          nombre: string
          unidad_default?: string | null
        }
        Update: {
          activo?: boolean
          arancel_ref?: number | null
          cat_gasto_id?: string
          id?: string
          nombre?: string
          unidad_default?: string | null
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
      condicion_iva_receptor: {
        Row: {
          activa: boolean
          descripcion: string
          id: number
        }
        Insert: {
          activa?: boolean
          descripcion: string
          id: number
        }
        Update: {
          activa?: boolean
          descripcion?: string
          id?: number
        }
        Relationships: []
      }
      config_cobranza: {
        Row: {
          dias_firme: number
          dias_por_vencer: number
          dias_recordatorio: number
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dias_firme?: number
          dias_por_vencer?: number
          dias_recordatorio?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dias_firme?: number
          dias_por_vencer?: number
          dias_recordatorio?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      contrato_sponsor: {
        Row: {
          asiento_firma_id: string | null
          created_at: string
          created_by: string | null
          id: string
          monto_total: number
          sponsor_id: string
          vigente_desde: string
          vigente_hasta: string
        }
        Insert: {
          asiento_firma_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto_total: number
          sponsor_id: string
          vigente_desde: string
          vigente_hasta: string
        }
        Update: {
          asiento_firma_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto_total?: number
          sponsor_id?: string
          vigente_desde?: string
          vigente_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_sponsor_asiento_firma_id_fkey"
            columns: ["asiento_firma_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_asiento_firma_id_fkey"
            columns: ["asiento_firma_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_asiento_firma_id_fkey"
            columns: ["asiento_firma_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
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
          {
            foreignKeyName: "cuenta_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "cuenta_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "v_pl_mensual_item"
            referencedColumns: ["cuenta_id"]
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
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_ficha_torneo"
            referencedColumns: ["ficha_id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_inscripcion"
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
            foreignKeyName: "cuota_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
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
      cuota_cobro_sponsor: {
        Row: {
          asiento_id: string | null
          cobrado_at: string | null
          contrato_id: string
          created_at: string
          fecha_cobro: string
          id: string
          monto: number
        }
        Insert: {
          asiento_id?: string | null
          cobrado_at?: string | null
          contrato_id: string
          created_at?: string
          fecha_cobro: string
          id?: string
          monto: number
        }
        Update: {
          asiento_id?: string | null
          cobrado_at?: string | null
          contrato_id?: string
          created_at?: string
          fecha_cobro?: string
          id?: string
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuota_cobro_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_sponsor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor_futuras"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_estado_sponsor"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "cuota_cobro_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["contrato_id"]
          },
        ]
      }
      devengo_socio: {
        Row: {
          asiento_id: string
          created_at: string
          id: string
          monto: number
          periodo_id: string
          socio_id: string
        }
        Insert: {
          asiento_id: string
          created_at?: string
          id?: string
          monto: number
          periodo_id: string
          socio_id: string
        }
        Update: {
          asiento_id?: string
          created_at?: string
          id?: string
          monto?: number
          periodo_id?: string
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devengo_socio_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_socio_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "devengo_socio_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "devengo_socio_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_socio_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "devengo_socio_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "devengo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      devengo_sponsor: {
        Row: {
          asiento_id: string
          contrato_id: string
          created_at: string
          id: string
          monto: number
          periodo_id: string
        }
        Insert: {
          asiento_id: string
          contrato_id: string
          created_at?: string
          id?: string
          monto: number
          periodo_id: string
        }
        Update: {
          asiento_id?: string
          contrato_id?: string
          created_at?: string
          id?: string
          monto?: number
          periodo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devengo_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_sponsor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor_futuras"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_estado_sponsor"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devengo_sponsor_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "devengo_sponsor_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
        ]
      }
      dia_cancha: {
        Row: {
          created_at: string
          fecha: string
          id: string
          predio_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: string
          predio_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          predio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
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
      emisor: {
        Row: {
          condicion_iva_id: number
          cuit: string
          id: boolean
          ingresos_brutos: string | null
          inicio_actividades: string | null
          razon_social: string
        }
        Insert: {
          condicion_iva_id: number
          cuit: string
          id?: boolean
          ingresos_brutos?: string | null
          inicio_actividades?: string | null
          razon_social: string
        }
        Update: {
          condicion_iva_id?: number
          cuit?: string
          id?: boolean
          ingresos_brutos?: string | null
          inicio_actividades?: string | null
          razon_social?: string
        }
        Relationships: [
          {
            foreignKeyName: "emisor_condicion_iva_id_fkey"
            columns: ["condicion_iva_id"]
            isOneToOne: false
            referencedRelation: "condicion_iva_receptor"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "envio_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      equipo_playoff: {
        Row: {
          created_at: string
          equipo_torneo_id: string
          id: string
          jornada_playoff_id: string
        }
        Insert: {
          created_at?: string
          equipo_torneo_id: string
          id?: string
          jornada_playoff_id: string
        }
        Update: {
          created_at?: string
          equipo_torneo_id?: string
          id?: string
          jornada_playoff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipo_playoff_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "equipo_torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_playoff_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "equipo_playoff_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "equipo_playoff_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_ficha_torneo"
            referencedColumns: ["ficha_id"]
          },
          {
            foreignKeyName: "equipo_playoff_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_inscripcion"
            referencedColumns: ["equipo_torneo_id"]
          },
          {
            foreignKeyName: "equipo_playoff_jornada_playoff_id_fkey"
            columns: ["jornada_playoff_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_playoff_jornada_playoff_id_fkey"
            columns: ["jornada_playoff_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
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
          total_plan: number
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
          total_plan?: number
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
          total_plan?: number
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
            foreignKeyName: "equipo_torneo_plan_inscripcion_id_fkey"
            columns: ["plan_inscripcion_id"]
            isOneToOne: false
            referencedRelation: "v_plan_tarifa_uso"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "equipo_torneo_plan_partidos_id_fkey"
            columns: ["plan_partidos_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_plan_partidos_id_fkey"
            columns: ["plan_partidos_id"]
            isOneToOne: false
            referencedRelation: "v_plan_tarifa_uso"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["serie_id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_estructura_torneo"
            referencedColumns: ["serie_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
      formato_instancia: {
        Row: {
          cantidad_partidos: number
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          cantidad_partidos: number
          id?: string
          nombre: string
          orden: number
        }
        Update: {
          cantidad_partidos?: number
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      gasto: {
        Row: {
          activo_id: string | null
          arancel: number
          asiento_dev_id: string | null
          asiento_pag_id: string | null
          cantidad: number
          cat_gasto_id: string
          comprobante_path: string | null
          concepto_id: string | null
          concepto_libre: string | null
          devengado_at: string
          id: string
          jornada_id: string | null
          medio_pago: string | null
          pagado_at: string | null
          predio_id: string | null
          proveedor_id: string | null
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
          comprobante_path?: string | null
          concepto_id?: string | null
          concepto_libre?: string | null
          devengado_at: string
          id?: string
          jornada_id?: string | null
          medio_pago?: string | null
          pagado_at?: string | null
          predio_id?: string | null
          proveedor_id?: string | null
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
          comprobante_path?: string | null
          concepto_id?: string | null
          concepto_libre?: string | null
          devengado_at?: string
          id?: string
          jornada_id?: string | null
          medio_pago?: string | null
          pagado_at?: string | null
          predio_id?: string | null
          proveedor_id?: string | null
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
            foreignKeyName: "gasto_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "v_activo"
            referencedColumns: ["activo_id"]
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
            foreignKeyName: "gasto_asiento_dev_id_fkey"
            columns: ["asiento_dev_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "gasto_asiento_pag_id_fkey"
            columns: ["asiento_pag_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "gasto_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
          },
          {
            foreignKeyName: "gasto_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedor"
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      gasto_planificado: {
        Row: {
          cat_gasto_id: string
          created_at: string
          created_by: string | null
          descripcion: string
          estado: string
          fecha_esperada: string
          gasto_id: string | null
          id: string
          monto: number
          torneo_id: string | null
        }
        Insert: {
          cat_gasto_id: string
          created_at?: string
          created_by?: string | null
          descripcion: string
          estado?: string
          fecha_esperada: string
          gasto_id?: string | null
          id?: string
          monto: number
          torneo_id?: string | null
        }
        Update: {
          cat_gasto_id?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string
          estado?: string
          fecha_esperada?: string
          gasto_id?: string | null
          id?: string
          monto?: number
          torneo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_planificado_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_planificado_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_planificado_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "v_gasto_detalle"
            referencedColumns: ["gasto_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_planificado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      jornada: {
        Row: {
          cantidad_esperada: number | null
          cantidad_partidos: number | null
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
          cantidad_partidos?: number | null
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
          cantidad_partidos?: number | null
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
            foreignKeyName: "jornada_instancia_fkey"
            columns: ["instancia"]
            isOneToOne: false
            referencedRelation: "formato_instancia"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "jornada_reprograma_a_fkey"
            columns: ["reprograma_a"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_reprograma_a_fkey"
            columns: ["reprograma_a"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
          },
          {
            foreignKeyName: "jornada_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["serie_id"]
          },
          {
            foreignKeyName: "jornada_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_estructura_torneo"
            referencedColumns: ["serie_id"]
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
            foreignKeyName: "movimiento_fondo_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["caja_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "movimiento_fondo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
            foreignKeyName: "pago_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "pago_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "pago_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
            foreignKeyName: "plan_tarifa_linea_hito_jornada_id_fkey"
            columns: ["hito_jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
          },
          {
            foreignKeyName: "plan_tarifa_linea_plan_tarifa_id_fkey"
            columns: ["plan_tarifa_id"]
            isOneToOne: false
            referencedRelation: "plan_tarifa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tarifa_linea_plan_tarifa_id_fkey"
            columns: ["plan_tarifa_id"]
            isOneToOne: false
            referencedRelation: "v_plan_tarifa_uso"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plantilla_mail: {
        Row: {
          asunto: string
          clave: string
          cuerpo: string
          cuerpo_texto: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          asunto: string
          clave: string
          cuerpo: string
          cuerpo_texto?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          asunto?: string
          clave?: string
          cuerpo?: string
          cuerpo_texto?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
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
          fecha: string | null
          id: string
          presupuesto_id: string
          unidad: string | null
        }
        Insert: {
          base: number
          cantidad?: number
          cat_gasto_id: string
          concepto_id?: string | null
          fecha?: string | null
          id?: string
          presupuesto_id: string
          unidad?: string | null
        }
        Update: {
          base?: number
          cantidad?: number
          cat_gasto_id?: string
          concepto_id?: string | null
          fecha?: string | null
          id?: string
          presupuesto_id?: string
          unidad?: string | null
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
          {
            foreignKeyName: "presupuesto_linea_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_ambito"
            referencedColumns: ["presupuesto_id"]
          },
        ]
      }
      proveedor: {
        Row: {
          activo: boolean
          condicion_iva_id: number | null
          contacto: string | null
          cuit: string | null
          domicilio: string | null
          email: string | null
          id: string
          nombre: string
          razon_social: string | null
        }
        Insert: {
          activo?: boolean
          condicion_iva_id?: number | null
          contacto?: string | null
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          nombre: string
          razon_social?: string | null
        }
        Update: {
          activo?: boolean
          condicion_iva_id?: number | null
          contacto?: string | null
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          nombre?: string
          razon_social?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedor_condicion_iva_id_fkey"
            columns: ["condicion_iva_id"]
            isOneToOne: false
            referencedRelation: "condicion_iva_receptor"
            referencedColumns: ["id"]
          },
        ]
      }
      punto_venta: {
        Row: {
          activo: boolean
          domicilio: string
          nombre: string
          numero: number
        }
        Insert: {
          activo?: boolean
          domicilio: string
          nombre: string
          numero: number
        }
        Update: {
          activo?: boolean
          domicilio?: string
          nombre?: string
          numero?: number
        }
        Relationships: []
      }
      reclamo: {
        Row: {
          canal: string
          created_at: string
          created_by: string
          cuota_ids: string[]
          cuotas: number
          destino: string | null
          etapa: string | null
          fecha: string
          id: string
          monto_reclamado: number
          tercero_id: string
          texto: string | null
          torneo_id: string | null
        }
        Insert: {
          canal: string
          created_at?: string
          created_by: string
          cuota_ids: string[]
          cuotas: number
          destino?: string | null
          etapa?: string | null
          fecha?: string
          id?: string
          monto_reclamado: number
          tercero_id: string
          texto?: string | null
          torneo_id?: string | null
        }
        Update: {
          canal?: string
          created_at?: string
          created_by?: string
          cuota_ids?: string[]
          cuotas?: number
          destino?: string | null
          etapa?: string | null
          fecha?: string
          id?: string
          monto_reclamado?: number
          tercero_id?: string
          texto?: string | null
          torneo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_kpi"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "reclamo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      retiro_bar: {
        Row: {
          anulado_at: string | null
          anulado_motivo: string | null
          asiento_id: string | null
          created_at: string
          created_by: string | null
          destino: string
          fecha: string
          id: string
          monto: number
          motivo: string | null
          predio_id: string
        }
        Insert: {
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_id?: string | null
          created_at?: string
          created_by?: string | null
          destino: string
          fecha: string
          id?: string
          monto: number
          motivo?: string | null
          predio_id: string
        }
        Update: {
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_id?: string | null
          created_at?: string
          created_by?: string | null
          destino?: string
          fecha?: string
          id?: string
          monto?: number
          motivo?: string | null
          predio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "retiro_bar_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
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
          {
            foreignKeyName: "serie_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "serie_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_estructura_torneo"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "serie_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_ficha_torneo"
            referencedColumns: ["categoria_id"]
          },
        ]
      }
      sueldo_socio: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          monto: number
          socio_id: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          monto: number
          socio_id: string
          vigente_desde: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          monto?: number
          socio_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      sueldo_socio_mes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          monto: number
          motivo: string
          periodo_id: string
          socio_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          monto: number
          motivo: string
          periodo_id: string
          socio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          monto?: number
          motivo?: string
          periodo_id?: string
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sueldo_socio_mes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "sueldo_socio_mes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      tercero: {
        Row: {
          activo: boolean
          condicion_iva_receptor_default: number | null
          delegado: string | null
          doc_nro_default: string | null
          doc_tipo_default: number | null
          domicilio_fiscal: string | null
          email: string | null
          id: string
          nombre: string
          razon_social: string | null
          telefono: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          condicion_iva_receptor_default?: number | null
          delegado?: string | null
          doc_nro_default?: string | null
          doc_tipo_default?: number | null
          domicilio_fiscal?: string | null
          email?: string | null
          id?: string
          nombre: string
          razon_social?: string | null
          telefono?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          condicion_iva_receptor_default?: number | null
          delegado?: string | null
          doc_nro_default?: string | null
          doc_tipo_default?: number | null
          domicilio_fiscal?: string | null
          email?: string | null
          id?: string
          nombre?: string
          razon_social?: string | null
          telefono?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tercero_condicion_iva_fk"
            columns: ["condicion_iva_receptor_default"]
            isOneToOne: false
            referencedRelation: "condicion_iva_receptor"
            referencedColumns: ["id"]
          },
        ]
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
          orden: number
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
          orden?: never
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
          orden?: never
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
          {
            foreignKeyName: "usd_operacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
        ]
      }
      venta_bar: {
        Row: {
          anulado_at: string | null
          anulado_motivo: string | null
          asiento_id: string | null
          created_at: string
          created_by: string | null
          dia_cancha_id: string
          id: string
          monto_efectivo: number
          monto_mp: number
          monto_tarjeta: number
          observaciones: string | null
          total: number | null
        }
        Insert: {
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_id?: string | null
          created_at?: string
          created_by?: string | null
          dia_cancha_id: string
          id?: string
          monto_efectivo?: number
          monto_mp?: number
          monto_tarjeta?: number
          observaciones?: string | null
          total?: number | null
        }
        Update: {
          anulado_at?: string | null
          anulado_motivo?: string | null
          asiento_id?: string | null
          created_at?: string
          created_by?: string | null
          dia_cancha_id?: string
          id?: string
          monto_efectivo?: number
          monto_mp?: number
          monto_tarjeta?: number
          observaciones?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "dia_cancha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_bar"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_torneo"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_bar_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_efectivo_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
          },
        ]
      }
    }
    Views: {
      v_activo: {
        Row: {
          activo_id: string | null
          amortizado: number | null
          avance_pct: number | null
          categoria: string | null
          compra_registrada: boolean | null
          cuota_mensual: number | null
          cuotas_confirmadas: number | null
          cuotas_restantes: number | null
          descripcion: string | null
          estado: string | null
          fecha_alta: string | null
          fecha_baja: string | null
          gasto_id: string | null
          motivo_baja: string | null
          nombre: string | null
          predio: string | null
          predio_id: string | null
          residual: number | null
          valor_origen: number | null
          vida_util_meses: number | null
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
      v_activo_kpi: {
        Row: {
          activos: number | null
          amortizado: number | null
          avance_pct: number | null
          cuota_mensual_total: number | null
          dados_de_baja: number | null
          en_activos: number | null
          residual: number | null
          sin_compra: number | null
        }
        Relationships: []
      }
      v_amortizacion: {
        Row: {
          activo: string | null
          activo_id: string | null
          amortizacion_id: string | null
          anio: number | null
          asiento_fecha: string | null
          asiento_id: string | null
          cuotas_total: number | null
          estado: string | null
          mes: number | null
          monto: number | null
          numero_cuota: number | null
          periodo_id: string | null
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
            foreignKeyName: "amortizacion_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "v_activo"
            referencedColumns: ["activo_id"]
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
            foreignKeyName: "amortizacion_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
          {
            foreignKeyName: "amortizacion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_detalle_mensual"
            referencedColumns: ["periodo_id"]
          },
        ]
      }
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "anticipo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_arqueo_detalle: {
        Row: {
          ambito: string | null
          anulado_at: string | null
          anulado_motivo: string | null
          arqueo_id: string | null
          asiento_ajuste_id: string | null
          asiento_entrega_id: string | null
          created_at: string | null
          diferencia: number | null
          entregado_at: string | null
          estado: string | null
          fecha: string | null
          predio: string | null
          predio_id: string | null
          responsable_id: string | null
          saldo_contado: number | null
          saldo_sistema: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_entrega_id_fkey"
            columns: ["asiento_entrega_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "arqueo_asiento_id_fkey"
            columns: ["asiento_ajuste_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      v_arqueo_diferencia: {
        Row: {
          ambito: string | null
          arqueo_id: string | null
          clase: string | null
          diferencia: number | null
          estado: string | null
          fecha: string | null
          predio: string | null
          responsable_id: string | null
          saldo_contado: number | null
          saldo_sistema: number | null
        }
        Relationships: []
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
          {
            foreignKeyName: "asiento_linea_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
        ]
      }
      v_auditoria: {
        Row: {
          anterior: Json | null
          campos_cambiados: number | null
          created_at: string | null
          id: number | null
          nuevo: Json | null
          operacion: string | null
          registro_id: string | null
          tabla: string | null
          usuario_id: string | null
        }
        Insert: {
          anterior?: Json | null
          campos_cambiados?: never
          created_at?: string | null
          id?: number | null
          nuevo?: Json | null
          operacion?: string | null
          registro_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Update: {
          anterior?: Json | null
          campos_cambiados?: never
          created_at?: string | null
          id?: number | null
          nuevo?: Json | null
          operacion?: string | null
          registro_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      v_bar_mes: {
        Row: {
          anio: number | null
          costos: number | null
          efectivo: number | null
          facturado: number | null
          margen: number | null
          mercado_pago: number | null
          mes: number | null
          tarjeta: number | null
          ventas: number | null
        }
        Relationships: []
      }
      v_bar_total: {
        Row: {
          costos: number | null
          efectivo: number | null
          facturado: number | null
          margen: number | null
          mercado_pago: number | null
          tarjeta: number | null
          ventas: number | null
        }
        Relationships: []
      }
      v_calendario_dia: {
        Row: {
          acumulado: number | null
          dia: string | null
          entra: number | null
          items: number | null
          neto: number | null
          sale: number | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_calendario_jornadas: {
        Row: {
          cantidad_esperada: number | null
          cantidad_partidos: number | null
          categoria: string | null
          categoria_id: string | null
          cuotas_atadas: number | null
          es_playoff: boolean | null
          estado: string | null
          fecha: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          instancia: string | null
          jornada_id: string | null
          numero: number | null
          reprograma_a: string | null
          reprograma_a_fecha: string | null
          serie: string | null
          serie_completa: string | null
          serie_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_instancia_fkey"
            columns: ["instancia"]
            isOneToOne: false
            referencedRelation: "formato_instancia"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "jornada_reprograma_a_fkey"
            columns: ["reprograma_a"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_reprograma_a_fkey"
            columns: ["reprograma_a"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
          },
        ]
      }
      v_calendario_kpi: {
        Row: {
          entra: number | null
          items: number | null
          neto: number | null
          proximo_dia: string | null
          proximo_items: number | null
          proximo_monto: number | null
          sale: number | null
          vencido_monto: number | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_calendario_mes: {
        Row: {
          dias_con_algo: number | null
          entra: number | null
          items: number | null
          mes: string | null
          neto: number | null
          sale: number | null
          vencidos: number | null
        }
        Relationships: []
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
      v_cashflow: {
        Row: {
          cola_incompleta: boolean | null
          entradas: number | null
          flujo_neto: number | null
          futura: boolean | null
          mes: string | null
          monto_comprometido: number | null
          monto_estimado: number | null
          monto_real: number | null
          saldo_proyectado: number | null
          salidas: number | null
          semana: string | null
        }
        Relationships: []
      }
      v_cashflow_comprometido: {
        Row: {
          arrastrada: boolean | null
          detalle: string | null
          fecha: string | null
          fecha_original: string | null
          monto: number | null
          nivel: string | null
          origen: string | null
          origen_id: string | null
          tercero_id: string | null
        }
        Relationships: []
      }
      v_cashflow_estimado: {
        Row: {
          detalle: string | null
          fecha: string | null
          monto: number | null
          nivel: string | null
          origen: string | null
        }
        Relationships: []
      }
      v_cashflow_gastos_estimado_extra: {
        Row: {
          detalle: string | null
          fecha: string | null
          monto: number | null
          nivel: string | null
          origen: string | null
        }
        Insert: {
          detalle?: string | null
          fecha?: string | null
          monto?: never
          nivel?: never
          origen?: never
        }
        Update: {
          detalle?: string | null
          fecha?: string | null
          monto?: never
          nivel?: never
          origen?: never
        }
        Relationships: []
      }
      v_cashflow_mensual: {
        Row: {
          cola_incompleta: boolean | null
          entradas: number | null
          flujo_neto: number | null
          futura: boolean | null
          mes: string | null
          monto_comprometido: number | null
          monto_estimado: number | null
          monto_real: number | null
          saldo_proyectado: number | null
          salidas: number | null
        }
        Relationships: []
      }
      v_cashflow_quiebre: {
        Row: {
          flujo_neto: number | null
          mes: string | null
          saldo_proyectado: number | null
          semana: string | null
        }
        Relationships: []
      }
      v_cashflow_real: {
        Row: {
          fecha: string | null
          monto: number | null
          nivel: string | null
          origen: string | null
        }
        Relationships: []
      }
      v_cheque: {
        Row: {
          asiento_alta_id: string | null
          asiento_cierre_id: string | null
          banco: string | null
          cheque_id: string | null
          contraparte: string | null
          created_at: string | null
          dias_para_cobro: number | null
          estado: string | null
          fecha_cobro: string | null
          fecha_emision: string | null
          fecha_estado: string | null
          gasto_id: string | null
          impacto: number | null
          monto: number | null
          numero: string | null
          observaciones: string | null
          origen_id: string | null
          origen_tipo: string | null
          pago_id: string | null
          sentido: string | null
          situacion: string | null
          vencido: boolean | null
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
            foreignKeyName: "cheque_asiento_alta_id_fkey"
            columns: ["asiento_alta_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "cheque_asiento_cierre_id_fkey"
            columns: ["asiento_cierre_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "cheque_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "v_gasto_detalle"
            referencedColumns: ["gasto_id"]
          },
          {
            foreignKeyName: "cheque_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cheque_kpi: {
        Row: {
          a_pagar: number | null
          emitidos_pendientes: number | null
          en_cartera: number | null
          monto_vencido: number | null
          neto: number | null
          proximos_30: number | null
          proximos_60: number | null
          rechazados: number | null
          recibidos_pendientes: number | null
          total: number | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_cliente: {
        Row: {
          activo: boolean | null
          condicion_iva: string | null
          condicion_iva_id: number | null
          delegado: string | null
          doc_nro: string | null
          doc_tipo: number | null
          domicilio_fiscal: string | null
          email: string | null
          es_responsable_inscripto: boolean | null
          estado_fiscal: string | null
          facturable: boolean | null
          falta: string[] | null
          falta_texto: string | null
          nombre: string | null
          razon_social: string | null
          telefono: string | null
          tercero_id: string | null
          tiene_condicion: boolean | null
          tiene_documento: boolean | null
          tipo: string | null
          torneos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tercero_condicion_iva_fk"
            columns: ["condicion_iva_id"]
            isOneToOne: false
            referencedRelation: "condicion_iva_receptor"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cliente_kpi: {
        Row: {
          equipos: number | null
          equipos_facturables: number | null
          equipos_incompletos: number | null
          equipos_sin_datos: number | null
          facturables: number | null
          incompletos: number | null
          sin_datos: number | null
          sponsors: number | null
          total: number | null
        }
        Relationships: []
      }
      v_cobranza_cola: {
        Row: {
          cuota_ids: string[] | null
          cuotas: number | null
          cuotas_vencidas: number | null
          dias_atraso_maximo: number | null
          equipo: string | null
          etapa: string | null
          proximo_vencimiento: string | null
          tercero_id: string | null
          torneo_id: string | null
          total_adeudado: number | null
          total_por_vencer: number | null
          total_vencido: number | null
          vencimiento_mas_antiguo: string | null
        }
        Relationships: []
      }
      v_cobranza_kpi: {
        Row: {
          cobrado: number | null
          comprometido: number | null
          dias_promedio_cobro: number | null
          nombre: string | null
          por_vencer: number | null
          tasa_cobranza: number | null
          torneo_id: string | null
          vencido: number | null
        }
        Relationships: []
      }
      v_cobranza_momento: {
        Row: {
          cuota_ids: string[] | null
          cuotas: number | null
          cuotas_vencidas: number | null
          dias_atraso_maximo: number | null
          equipo: string | null
          etapa: string | null
          proximo_vencimiento: string | null
          tercero_id: string | null
          torneo_id: string | null
          total_adeudado: number | null
          total_por_vencer: number | null
          total_vencido: number | null
          vencimiento_mas_antiguo: string | null
        }
        Relationships: []
      }
      v_cobro_medio_mes: {
        Row: {
          anio: number | null
          cobros: number | null
          medio_pago: string | null
          mes: number | null
          total: number | null
        }
        Relationships: []
      }
      v_comprobante: {
        Row: {
          anio: number | null
          cae: string | null
          cae_vencimiento: string | null
          condicion_iva: string | null
          cotizacion: number | null
          created_at: string | null
          cuota_cobro_sponsor_id: string | null
          detalle: string | null
          emisor_domicilio: string | null
          emitida_por: string | null
          error_detalle: string | null
          es_factura: boolean | null
          estado: string | null
          estado_label: string | null
          fecha_emision: string | null
          id: string | null
          iva: number | null
          letra: string | null
          moneda: string | null
          monto: number | null
          motivo_sin_origen: string | null
          neto: number | null
          numero: number | null
          numero_formateado: string | null
          pago_id: string | null
          periodo: string | null
          punto_venta: number | null
          receptor_doc: string | null
          receptor_domicilio: string | null
          receptor_nombre: string | null
          sin_origen: boolean | null
          tercero_id: string | null
          tiene_pdf: boolean | null
          tipo_cod_aut: string | null
          tipo_comprobante: number | null
          tipo_label: string | null
          ya_facturado: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "cuota_cobro_sponsor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "factura_cuota_cobro_sponsor_id_fkey"
            columns: ["cuota_cobro_sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuotas_sponsor_futuras"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "factura_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
        ]
      }
      v_comprobante_kpi: {
        Row: {
          con_error: number | null
          facturado_mes: number | null
          facturas: number | null
          pendientes: number | null
          recibos: number | null
          total: number | null
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
          medio_previsto: Database["public"]["Enums"]["medio_pago"] | null
          plan_inscripcion: string | null
          plan_partidos: string | null
          proximo_vencimiento: string | null
          saldo: number | null
          serie: string | null
          tercero_id: string | null
          torneo: string | null
          torneo_id: string | null
          total_pagado: number | null
          total_plan: number | null
        }
        Relationships: []
      }
      v_cuotas_sponsor: {
        Row: {
          cobrado_at: string | null
          contrato_id: string | null
          cuota_id: string | null
          estado: string | null
          fecha_cobro: string | null
          monto: number | null
          numero: number | null
          sponsor: string | null
          sponsor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_cuotas_sponsor_futuras: {
        Row: {
          contrato_id: string | null
          cuota_id: string | null
          fecha_cobro: string | null
          monto: number | null
          sponsor: string | null
          sponsor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_dashboard: {
        Row: {
          activo: boolean | null
          cobrado: number | null
          comprometido: number | null
          equipos_al_dia: number | null
          equipos_en_mora: number | null
          equipos_total: number | null
          por_cobrar: number | null
          por_vencer: number | null
          resultado: number | null
          torneo: string | null
          torneo_id: string | null
          vencido: number | null
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
          jornada_suspendida: boolean | null
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
      v_deuda_equipo_torneo: {
        Row: {
          cuotas_impagas: number | null
          deuda_total: number | null
          deuda_vencida: number | null
          email: string | null
          equipo: string | null
          saldo_a_favor: number | null
          tercero_id: string | null
          torneo: string | null
          torneo_id: string | null
          vencimiento_mas_antiguo: string | null
        }
        Relationships: [
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_dia_cancha_bar: {
        Row: {
          dia_cancha_id: string | null
          fecha: string | null
          predio: string | null
          predio_id: string | null
          predio_nombre: string | null
          venta_bar_id: string | null
          venta_bar_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dia_cancha_torneo: {
        Row: {
          dia_cancha_id: string | null
          fecha: string | null
          predio_id: string | null
          torneo_id: string | null
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      v_efectivo_sin_rendir: {
        Row: {
          arqueos_pendientes: number | null
          desde: string | null
          hasta: string | null
          monto_sin_rendir: number | null
          responsable_id: string | null
        }
        Relationships: []
      }
      v_estado_cuota: {
        Row: {
          equipo_torneo_id: string | null
          estado: string | null
          id: string | null
          jornada_suspendida: boolean | null
          monto: number | null
          numero: number | null
          pagado: number | null
          pagado_at: string | null
          saldo: number | null
          torneo: string | null
          torneo_id: string | null
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
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_ficha_torneo"
            referencedColumns: ["ficha_id"]
          },
          {
            foreignKeyName: "cuota_equipo_torneo_id_fkey"
            columns: ["equipo_torneo_id"]
            isOneToOne: false
            referencedRelation: "v_inscripcion"
            referencedColumns: ["equipo_torneo_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_estado_sponsor: {
        Row: {
          cobrado: number | null
          contrato_id: string | null
          cuotas: number | null
          cuotas_pendientes: number | null
          devengado: number | null
          meses: number | null
          monto_total: number | null
          pendiente_cobrar: number | null
          pendiente_devengar: number | null
          sponsor: string | null
          sponsor_id: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_estructura_torneo: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          categoria_orden: number | null
          equipos: number | null
          equipos_categoria: number | null
          genero: string | null
          serie: string | null
          serie_id: string | null
          serie_orden: number | null
          torneo_id: string | null
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "categoria_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_facturado_direccion: {
        Row: {
          anio: number | null
          comprobantes: number | null
          direccion: string | null
          mes: number | null
          punto: string | null
          punto_desconocido: boolean | null
          punto_venta: number | null
          total: number | null
        }
        Relationships: []
      }
      v_facturado_direccion_total: {
        Row: {
          comprobantes: number | null
          direccion: string | null
          punto: string | null
          punto_desconocido: boolean | null
          punto_venta: number | null
          total: number | null
        }
        Relationships: []
      }
      v_facturado_por_direccion: {
        Row: {
          anio: number | null
          cantidad: number | null
          domicilio: string | null
          iva: number | null
          neto: number | null
          periodo: string | null
          punto_nombre: string | null
          punto_venta: number | null
          total: number | null
        }
        Relationships: []
      }
      v_ficha_torneo: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          categoria_orden: number | null
          cuotas: number | null
          cuotas_con_jornada: number | null
          cuotas_pagadas: number | null
          equipo: string | null
          ficha_id: string | null
          genero: string | null
          medio_previsto: string | null
          plan_inscripcion: string | null
          plan_partidos: string | null
          serie: string | null
          serie_id: string | null
          serie_orden: number | null
          tercero_id: string | null
          torneo_id: string | null
          total_plan: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["serie_id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_estructura_torneo"
            referencedColumns: ["serie_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_gasto_categoria_mes: {
        Row: {
          adeudado: number | null
          anio: number | null
          area: string | null
          cat_gasto_id: string | null
          categoria: string | null
          gastos: number | null
          mes: number | null
          naturaleza: string | null
          pagado: number | null
          torneo_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_cat_gasto_id_fkey"
            columns: ["cat_gasto_id"]
            isOneToOne: false
            referencedRelation: "cat_gasto"
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_gasto_detalle: {
        Row: {
          activo_id: string | null
          arancel: number | null
          area: string | null
          asiento_dev_id: string | null
          asiento_pag_id: string | null
          caja_pago: string | null
          cantidad: number | null
          cat_gasto_id: string | null
          categoria: string | null
          concepto: string | null
          devengado_at: string | null
          es_libre: boolean | null
          estado: string | null
          gasto_id: string | null
          jornada_fecha: string | null
          jornada_id: string | null
          jornada_numero: number | null
          medio_pago: string | null
          naturaleza: string | null
          pagado_at: string | null
          pagado_por: string | null
          pagado_por_id: string | null
          predio: string | null
          predio_id: string | null
          predio_pago: string | null
          torneo: string | null
          torneo_id: string | null
          total: number | null
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
            foreignKeyName: "gasto_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "v_activo"
            referencedColumns: ["activo_id"]
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
            foreignKeyName: "gasto_asiento_dev_id_fkey"
            columns: ["asiento_dev_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "gasto_asiento_pag_id_fkey"
            columns: ["asiento_pag_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
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
            foreignKeyName: "gasto_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["jornada_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "gasto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_gasto_kpi: {
        Row: {
          adeudado: number | null
          anio: number | null
          gastos: number | null
          gastos_impagos: number | null
          mes: number | null
          pagado: number | null
          total: number | null
        }
        Relationships: []
      }
      v_gasto_naturaleza_mes: {
        Row: {
          adeudado: number | null
          anio: number | null
          gastos: number | null
          gastos_impagos: number | null
          mes: number | null
          naturaleza: string | null
          pagado: number | null
          total: number | null
        }
        Relationships: []
      }
      v_inscripcion: {
        Row: {
          categoria: string | null
          cuotas_inscripcion: number | null
          cuotas_pagadas: number | null
          equipo: string | null
          equipo_torneo_id: string | null
          estado_inscripcion: string | null
          genero: Database["public"]["Enums"]["genero"] | null
          medio_previsto: Database["public"]["Enums"]["medio_pago"] | null
          monto_insc: number | null
          primer_venc: string | null
          serie: string | null
          serie_completa: string | null
          serie_id: string | null
          tercero_id: string | null
          tiene_vencida: boolean | null
          torneo: string | null
          torneo_id: string | null
          total_plan: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "serie"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_calendario_jornadas"
            referencedColumns: ["serie_id"]
          },
          {
            foreignKeyName: "equipo_torneo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "v_estructura_torneo"
            referencedColumns: ["serie_id"]
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
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
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
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "equipo_torneo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "equipo_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
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
      v_movimiento_caja: {
        Row: {
          anulado: boolean | null
          asiento_id: string | null
          caja: string | null
          caja_id: string | null
          debe: number | null
          descripcion: string | null
          fecha: string | null
          haber: number | null
          neto: number | null
          origen: string | null
          saldo_corrido: number | null
        }
        Relationships: []
      }
      v_pl_kpi: {
        Row: {
          anio: number | null
          egresos: number | null
          ingresos_cobrados: number | null
          margen_pct: number | null
          mejor_mes: number | null
          mejor_mes_resultado: number | null
          meses_con_movimiento: number | null
          resultado: number | null
          resultado_financiero: number | null
        }
        Relationships: []
      }
      v_pl_mensual: {
        Row: {
          anio: number | null
          codigo: string | null
          cuenta_id: string | null
          mes: number | null
          monto: number | null
          nombre: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_pl_mensual_item: {
        Row: {
          anio: number | null
          codigo: string | null
          cuenta: string | null
          cuenta_id: string | null
          item: string | null
          mes: number | null
          monto: number | null
        }
        Relationships: []
      }
      v_pl_mensual_total: {
        Row: {
          anio: number | null
          egresos: number | null
          financiero: number | null
          ingresos: number | null
          mes: number | null
          resultado: number | null
        }
        Relationships: []
      }
      v_plan_tarifa_uso: {
        Row: {
          activo: boolean | null
          concepto: string | null
          cuotas_emitidas: number | null
          fichas: number | null
          genero: string | null
          lineas: number | null
          monto_emitido: number | null
          opcion_nombre: string | null
          opcion_orden: number | null
          plan_id: string | null
          torneo_id: string | null
        }
        Insert: {
          activo?: boolean | null
          concepto?: never
          cuotas_emitidas?: never
          fichas?: never
          genero?: never
          lineas?: never
          monto_emitido?: never
          opcion_nombre?: string | null
          opcion_orden?: number | null
          plan_id?: string | null
          torneo_id?: string | null
        }
        Update: {
          activo?: boolean | null
          concepto?: never
          cuotas_emitidas?: never
          fichas?: never
          genero?: never
          lineas?: never
          monto_emitido?: never
          opcion_nombre?: string | null
          opcion_orden?: number | null
          plan_id?: string | null
          torneo_id?: string | null
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "plan_tarifa_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_presupuesto_ambito: {
        Row: {
          ambito: string | null
          anio: number | null
          ejercicio_id: string | null
          es_estructura: boolean | null
          estado: string | null
          lineas: number | null
          lineas_sin_calendario: number | null
          presupuesto_id: string | null
          torneo_id: string | null
          total: number | null
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_presupuesto_linea: {
        Row: {
          base: number | null
          cantidad: number | null
          cat_gasto_id: string | null
          concepto_id: string | null
          ejercicio_id: string | null
          estado: string | null
          factor: number | null
          id: string | null
          presupuesto_id: string | null
          torneo_id: string | null
          total_presupuestado: number | null
          unidad: string | null
          unidad_linea: string | null
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
            foreignKeyName: "presupuesto_linea_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_ambito"
            referencedColumns: ["presupuesto_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_presupuesto_total: {
        Row: {
          base: number | null
          cantidad: number | null
          cat_gasto_id: string | null
          concepto_id: string | null
          ejercicio_id: string | null
          factor: number | null
          id: string | null
          presupuesto_id: string | null
          torneo_id: string | null
          total_presupuestado: number | null
          unidad: string | null
          unidad_linea: string | null
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
            foreignKeyName: "presupuesto_linea_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_ambito"
            referencedColumns: ["presupuesto_id"]
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
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_actual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_escala"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "presupuesto_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneo_lista"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_presupuesto_vs_real: {
        Row: {
          ambito: string | null
          cat_gasto_id: string | null
          categoria: string | null
          desvio: number | null
          desvio_pct: number | null
          es_estructura: boolean | null
          estado: string | null
          gastos: number | null
          mes: string | null
          naturaleza: string | null
          presupuestado: number | null
          real: number | null
          real_pagado: number | null
          torneo_id: string | null
        }
        Relationships: []
      }
      v_presupuesto_vs_real_anual: {
        Row: {
          ambito: string | null
          cat_gasto_id: string | null
          categoria: string | null
          desvio: number | null
          desvio_pct: number | null
          es_estructura: boolean | null
          estado: string | null
          meses_con_gasto: number | null
          meses_excedidos: number | null
          naturaleza: string | null
          presupuestado: number | null
          real: number | null
          torneo_id: string | null
        }
        Relationships: []
      }
      v_presupuesto_vs_real_kpi: {
        Row: {
          categorias: number | null
          desvio: number | null
          estado: string | null
          filas: number | null
          presupuestado: number | null
          real: number | null
          tramo: string | null
        }
        Relationships: []
      }
      v_reclamo_equipo: {
        Row: {
          dias_desde_ultimo: number | null
          reclamos: number | null
          tercero_id: string | null
          ultimo_canal: string | null
          ultimo_monto: number | null
          ultimo_reclamo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reclamo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_resultado_cambio: {
        Row: {
          anio: number | null
          ganancias: number | null
          mes: number | null
          perdidas: number | null
          resultado: number | null
        }
        Relationships: []
      }
      v_resultado_cambio_total: {
        Row: {
          ganancias: number | null
          meses: number | null
          perdidas: number | null
          resultado: number | null
        }
        Relationships: []
      }
      v_retiro_bar: {
        Row: {
          anulado_at: string | null
          anulado_motivo: string | null
          asiento_id: string | null
          created_at: string | null
          created_by: string | null
          destino: string | null
          destino_nombre: string | null
          estado: string | null
          fecha: string | null
          monto: number | null
          motivo: string | null
          predio: string | null
          predio_id: string | null
          predio_nombre: string | null
          retiro_bar_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "retiro_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "retiro_bar_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldo_bar_dia_cancha: {
        Row: {
          arqueo_estado: string | null
          arqueo_id: string | null
          dia_cancha_id: string | null
          fecha: string | null
          predio: string | null
          predio_id: string | null
          predio_nombre: string | null
          saldo_sistema: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
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
      v_saldo_caja_total: {
        Row: {
          cajas: number | null
          saldo_total: number | null
        }
        Relationships: []
      }
      v_saldo_efectivo_dia_cancha: {
        Row: {
          arqueo_estado: string | null
          arqueo_id: string | null
          dia_cancha_id: string | null
          fecha: string | null
          predio: string | null
          predio_id: string | null
          predio_nombre: string | null
          saldo_sistema: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldo_socio: {
        Row: {
          activo: boolean | null
          devengado: number | null
          nombre: string | null
          retirado: number | null
          saldo: number | null
          socio_id: string | null
        }
        Relationships: []
      }
      v_socio_detalle_mensual: {
        Row: {
          acordado: number | null
          anio: number | null
          devengado: number | null
          es_excepcion: boolean | null
          mes: number | null
          neto: number | null
          nombre: string | null
          periodo_id: string | null
          retirado: number | null
          saldo_acumulado: number | null
          socio_id: string | null
        }
        Relationships: []
      }
      v_socio_kpi: {
        Row: {
          devengado: number | null
          retirado: number | null
          saldo_a_favor: number | null
          saldo_en_contra: number | null
          socios: number | null
          socios_activos: number | null
          socios_en_contra: number | null
          socios_sin_sueldo: number | null
          sueldo_mensual: number | null
        }
        Relationships: []
      }
      v_socio_lista: {
        Row: {
          activo: boolean | null
          devengado: number | null
          es_excepcion: boolean | null
          estado: string | null
          meses_con_movimiento: number | null
          retirado: number | null
          saldo: number | null
          socio: string | null
          socio_id: string | null
          sueldo_vigente: number | null
          vigente_desde: string | null
        }
        Relationships: []
      }
      v_sponsor_detalle_mensual: {
        Row: {
          anio: number | null
          contrato_id: string | null
          devengado: number | null
          devengado_acumulado: number | null
          mes: number | null
          pendiente_devengar: number | null
          periodo_id: string | null
          sponsor: string | null
          sponsor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "tercero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cliente"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_cola"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cobranza_momento"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_cuenta_corriente_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_detalle"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_equipo_torneo"
            referencedColumns: ["tercero_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_detalle_mensual"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_socio_lista"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "contrato_sponsor_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "v_sponsor_lista"
            referencedColumns: ["sponsor_id"]
          },
        ]
      }
      v_sponsor_kpi: {
        Row: {
          cobrado: number | null
          contratado: number | null
          contratos: number | null
          cuotas_vencidas: number | null
          pendiente_cobrar: number | null
          pendiente_devengar: number | null
          reconocido: number | null
          sponsors: number | null
          sponsors_en_mora: number | null
        }
        Relationships: []
      }
      v_sponsor_lista: {
        Row: {
          activo: boolean | null
          cobrado: number | null
          contratado: number | null
          contratos: number | null
          cuotas: number | null
          cuotas_pendientes: number | null
          cuotas_vencidas: number | null
          email: string | null
          estado: string | null
          pendiente_cobrar: number | null
          pendiente_devengar: number | null
          reconocido: number | null
          sponsor: string | null
          sponsor_id: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Relationships: []
      }
      v_tenencia_usd: {
        Row: {
          costo_libros: number | null
          promedio_ponderado: number | null
          tenencia_usd: number | null
        }
        Relationships: []
      }
      v_torneo_actual: {
        Row: {
          anio: number | null
          ejercicio_id: string | null
          estado: string | null
          fecha_desde: string | null
          fecha_hasta: string | null
          id: string | null
          nombre: string | null
          temporada: Database["public"]["Enums"]["temporada"] | null
        }
        Insert: {
          anio?: number | null
          ejercicio_id?: string | null
          estado?: string | null
          fecha_desde?: string | null
          fecha_hasta?: string | null
          id?: string | null
          nombre?: string | null
          temporada?: Database["public"]["Enums"]["temporada"] | null
        }
        Update: {
          anio?: number | null
          ejercicio_id?: string | null
          estado?: string | null
          fecha_desde?: string | null
          fecha_hasta?: string | null
          id?: string | null
          nombre?: string | null
          temporada?: Database["public"]["Enums"]["temporada"] | null
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
      v_torneo_escala: {
        Row: {
          dias_cancha: number | null
          partidos: number | null
          torneo_id: string | null
        }
        Insert: {
          dias_cancha?: never
          partidos?: never
          torneo_id?: string | null
        }
        Update: {
          dias_cancha?: never
          partidos?: never
          torneo_id?: string | null
        }
        Relationships: []
      }
      v_torneo_lista: {
        Row: {
          activo: boolean | null
          anio: number | null
          categorias: number | null
          ejercicio_anio: number | null
          ejercicio_id: string | null
          equipos: number | null
          estado: string | null
          fecha_desde: string | null
          fecha_hasta: string | null
          nombre: string | null
          planes: number | null
          series: number | null
          temporada: string | null
          tiene_estructura: boolean | null
          torneo_id: string | null
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
      v_usd_sincronia: {
        Row: {
          costo_esperado: number | null
          costo_libros: number | null
          diferencia: number | null
          estado: string | null
          lineas_caja_usd: number | null
          operaciones: number | null
        }
        Relationships: []
      }
      v_venta_bar: {
        Row: {
          anulado_at: string | null
          anulado_motivo: string | null
          asiento_id: string | null
          created_at: string | null
          created_by: string | null
          dia_cancha_id: string | null
          estado: string | null
          fecha: string | null
          monto_efectivo: number | null
          monto_mp: number | null
          monto_tarjeta: number | null
          observaciones: string | null
          predio: string | null
          predio_id: string | null
          predio_nombre: string | null
          total: number | null
          venta_bar_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dia_cancha_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_libro_diario"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "venta_bar_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "v_movimiento_caja"
            referencedColumns: ["asiento_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "dia_cancha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_bar"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_dia_cancha_torneo"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_bar_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
          },
          {
            foreignKeyName: "venta_bar_dia_cancha_id_fkey"
            columns: ["dia_cancha_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_efectivo_dia_cancha"
            referencedColumns: ["dia_cancha_id"]
          },
        ]
      }
    }
    Functions: {
      agregar_linea_presupuesto: {
        Args: {
          p_base: number
          p_cantidad?: number
          p_cat_gasto_id: string
          p_concepto_id?: string
          p_presupuesto_id: string
          p_unidad?: string
        }
        Returns: string
      }
      anular_arqueo: {
        Args: {
          p_arqueo_id: string
          p_created_by?: string
          p_fecha?: string
          p_motivo: string
        }
        Returns: number
      }
      anular_asiento: {
        Args: {
          p_asiento_id: string
          p_created_by?: string
          p_fecha?: string
          p_motivo: string
          p_via_circuito?: boolean
        }
        Returns: string
      }
      anular_cobro_sponsor: {
        Args: { p_created_by?: string; p_cuota_id: string; p_motivo: string }
        Returns: string
      }
      anular_gasto: {
        Args: {
          p_created_by?: string
          p_fecha?: string
          p_gasto_id: string
          p_motivo: string
        }
        Returns: undefined
      }
      anular_pago: {
        Args: { p_created_by?: string; p_motivo: string; p_pago_id: string }
        Returns: string
      }
      anular_retiro_bar: {
        Args: {
          p_created_by?: string
          p_fecha?: string
          p_motivo: string
          p_retiro_id: string
        }
        Returns: string
      }
      anular_venta_bar: {
        Args: {
          p_created_by?: string
          p_fecha?: string
          p_motivo: string
          p_venta_id: string
        }
        Returns: string
      }
      aplicar_anticipo: {
        Args: { p_cuota_id: string; p_monto: number; p_tercero_id: string }
        Returns: number
      }
      aprobar_presupuesto: {
        Args: { p_presupuesto_id: string }
        Returns: undefined
      }
      arca_guardar_ticket: {
        Args: {
          p_expira_at: string
          p_produccion: boolean
          p_servicio: string
          p_sign: string
          p_token: string
        }
        Returns: undefined
      }
      arca_ticket_vigente: {
        Args: { p_produccion: boolean; p_servicio: string }
        Returns: {
          expira_at: string
          sign: string
          token: string
        }[]
      }
      arrastrar_fichas: {
        Args: {
          p_destino_id: string
          p_origen_id: string
          p_responsable_id?: string
          p_simular?: boolean
        }
        Returns: Json
      }
      asentar_amortizacion: {
        Args: {
          p_activo_id?: string
          p_created_by?: string
          p_periodo_id: string
        }
        Returns: number
      }
      asentar_diferencia_arqueo: {
        Args: { p_arqueo_id: string; p_created_by?: string; p_fecha?: string }
        Returns: string
      }
      auth_rol: { Args: never; Returns: string }
      borrar_categoria: { Args: { p_categoria_id: string }; Returns: undefined }
      borrar_linea_presupuesto: {
        Args: { p_linea_id: string }
        Returns: undefined
      }
      borrar_linea_tarifa: { Args: { p_linea_id: string }; Returns: undefined }
      borrar_serie: { Args: { p_serie_id: string }; Returns: undefined }
      cambiar_estado_cheque: {
        Args: {
          p_caja_id?: string
          p_cheque_id: string
          p_fecha?: string
          p_nuevo_estado: string
          p_responsable_id?: string
        }
        Returns: string
      }
      cargar_cuotas_sponsor: {
        Args: { p_contrato_id: string; p_cuotas: Json }
        Returns: number
      }
      cerrar_comprobante: {
        Args: { p_cae: string; p_cae_vencimiento: string; p_id: string }
        Returns: undefined
      }
      cerrar_periodo: {
        Args: {
          p_amortizacion_vista?: boolean
          p_periodo_id: string
          p_responsable_id?: string
        }
        Returns: undefined
      }
      cerrar_torneo: {
        Args: { p_motivo?: string; p_torneo_id: string }
        Returns: undefined
      }
      clonar_estructura_torneo: {
        Args: { p_destino_id: string; p_origen_id: string }
        Returns: Json
      }
      clonar_torneo: {
        Args: {
          p_anio: number
          p_created_by?: string
          p_ejercicio_id: string
          p_nombre_nuevo: string
          p_temporada: Database["public"]["Enums"]["temporada"]
          p_torneo_origen_id: string
        }
        Returns: string
      }
      comprar_activo: {
        Args: {
          p_cat_gasto_id: string
          p_categoria: string
          p_created_by?: string
          p_descripcion?: string
          p_fecha: string
          p_nombre: string
          p_predio_id?: string
          p_proveedor_id?: string
          p_valor: number
          p_vida_util_meses: number
        }
        Returns: string
      }
      comprar_usd: {
        Args: {
          p_cantidad: number
          p_created_by?: string
          p_fecha: string
          p_medio?: string
          p_motivo?: string
          p_tc: number
        }
        Returns: string
      }
      crear_arqueo: {
        Args: {
          p_ambito?: string
          p_dia_cancha_id: string
          p_responsable_id?: string
          p_saldo_contado: number
        }
        Returns: string
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
      crear_cat_gasto: {
        Args: {
          p_area: string
          p_cuenta_id: string
          p_imputacion_default: string
          p_naturaleza: string
          p_nombre: string
          p_unidad_default: string
        }
        Returns: string
      }
      crear_categoria: {
        Args: {
          p_genero: Database["public"]["Enums"]["genero"]
          p_nombre: string
          p_orden?: number
          p_torneo_id: string
        }
        Returns: string
      }
      crear_contrato_sponsor: {
        Args: {
          p_created_by?: string
          p_cuotas?: Json
          p_fecha_firma?: string
          p_monto_total: number
          p_sponsor_id: string
          p_vigente_desde: string
          p_vigente_hasta: string
        }
        Returns: string
      }
      crear_dia_cancha: {
        Args: { p_fecha: string; p_predio_id: string }
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
      crear_gasto_planificado: {
        Args: {
          p_cat_gasto_id: string
          p_descripcion: string
          p_fecha_esperada: string
          p_monto: number
          p_responsable_id?: string
          p_torneo_id?: string
        }
        Returns: string
      }
      crear_jornada: {
        Args: { p_fecha?: string; p_numero: number; p_serie_id: string }
        Returns: string
      }
      crear_linea_tarifa: {
        Args: {
          p_cantidad_esperada?: number
          p_concepto_label: string
          p_es_playoff?: boolean
          p_fecha_desde?: number
          p_fecha_hasta?: number
          p_fecha_referencia?: string
          p_linea_orden?: number
          p_observacion?: string
          p_plan_id: string
          p_precio_efectivo: number
          p_precio_transferencia: number
          p_regla: Database["public"]["Enums"]["regla_vencimiento"]
        }
        Returns: string
      }
      crear_plan_tarifa: {
        Args: {
          p_concepto: Database["public"]["Enums"]["concepto_pago"]
          p_genero: Database["public"]["Enums"]["genero"]
          p_opcion_nombre: string
          p_opcion_orden?: number
          p_torneo_id: string
        }
        Returns: string
      }
      crear_playoff: {
        Args: {
          p_cantidad_partidos?: number
          p_fecha?: string
          p_instancia: string
          p_serie_id: string
        }
        Returns: string
      }
      crear_presupuesto: {
        Args: { p_ejercicio_id: string; p_torneo_id?: string }
        Returns: string
      }
      crear_proveedor: {
        Args: {
          p_condicion_iva_id?: number
          p_contacto?: string
          p_cuit?: string
          p_domicilio?: string
          p_email?: string
          p_nombre: string
          p_razon_social?: string
        }
        Returns: string
      }
      crear_retiro_socio: {
        Args: {
          p_fecha?: string
          p_medio: string
          p_monto: number
          p_predio_id?: string
          p_socio_id: string
        }
        Returns: string
      }
      crear_serie: {
        Args: { p_categoria_id: string; p_nombre: string; p_orden?: number }
        Returns: string
      }
      crear_sponsor: {
        Args: {
          p_condicion_iva_receptor_default?: number
          p_doc_nro_default?: string
          p_doc_tipo_default?: number
          p_domicilio_fiscal?: string
          p_email?: string
          p_nombre: string
          p_razon_social?: string
          p_telefono?: string
        }
        Returns: string
      }
      crear_torneo: {
        Args: {
          p_anio: number
          p_ejercicio_id?: string
          p_fecha_desde?: string
          p_fecha_hasta?: string
          p_nombre: string
          p_temporada: Database["public"]["Enums"]["temporada"]
        }
        Returns: string
      }
      cuit_valido: { Args: { p_cuit: string }; Returns: boolean }
      desactivar_cat_gasto: {
        Args: { p_cat_gasto_id: string }
        Returns: undefined
      }
      devengar_sponsors: {
        Args: { p_created_by?: string; p_periodo_id: string }
        Returns: number
      }
      devengar_sueldos_socios: {
        Args: { p_created_by?: string; p_periodo_id: string }
        Returns: number
      }
      editar_cat_gasto: {
        Args: {
          p_area?: string
          p_cat_gasto_id: string
          p_cuenta_id?: string
          p_imputacion_default?: string
          p_naturaleza?: string
          p_nombre?: string
          p_unidad_default?: string
        }
        Returns: undefined
      }
      editar_categoria: {
        Args: {
          p_categoria_id: string
          p_genero?: Database["public"]["Enums"]["genero"]
          p_nombre?: string
          p_orden?: number
        }
        Returns: undefined
      }
      editar_linea_presupuesto: {
        Args: {
          p_base?: number
          p_cantidad?: number
          p_linea_id: string
          p_unidad?: string
        }
        Returns: undefined
      }
      editar_linea_tarifa: {
        Args: {
          p_cantidad_esperada?: number
          p_concepto_label?: string
          p_fecha_desde?: number
          p_fecha_hasta?: number
          p_fecha_referencia?: string
          p_linea_id: string
          p_linea_orden?: number
          p_observacion?: string
          p_precio_efectivo?: number
          p_precio_transferencia?: number
        }
        Returns: undefined
      }
      editar_plan_tarifa: {
        Args: {
          p_activo?: boolean
          p_opcion_nombre?: string
          p_opcion_orden?: number
          p_plan_id: string
        }
        Returns: undefined
      }
      editar_serie: {
        Args: { p_nombre?: string; p_orden?: number; p_serie_id: string }
        Returns: undefined
      }
      eliminar_dia_cancha: {
        Args: { p_dia_cancha_id: string }
        Returns: undefined
      }
      email_usuario: { Args: { p_usuario_id: string }; Returns: string }
      es_sueldo_excepcion: {
        Args: { p_fecha: string; p_socio_id: string }
        Returns: boolean
      }
      generar_cuotas_ficha: {
        Args: { p_equipo_torneo_id: string }
        Returns: number
      }
      generar_cuotas_instancia: {
        Args: { p_jornada_playoff_id: string }
        Returns: number
      }
      generar_cuotas_plan: { Args: { p_plan_id: string }; Returns: number }
      generar_grilla_liga: {
        Args: { p_cantidad_fechas: number; p_serie_id: string }
        Returns: number
      }
      imputar_pago: {
        Args: { p_imputaciones: Json; p_pago_id: string }
        Returns: number
      }
      imputar_pago_automatico: { Args: { p_pago_id: string }; Returns: number }
      iniciar_torneo: { Args: { p_torneo_id: string }; Returns: undefined }
      liquidar_efectivo_transito: {
        Args: {
          p_fecha?: string
          p_pago_id: string
          p_predio_id: string
          p_responsable_id?: string
        }
        Returns: string
      }
      marcar_error_comprobante: {
        Args: { p_detalle: string; p_id: string }
        Returns: undefined
      }
      marcar_gasto_planificado_ejecutado: {
        Args: { p_gasto_id: string; p_planificado_id: string }
        Returns: undefined
      }
      meses_contrato: {
        Args: { p_desde: string; p_hasta: string }
        Returns: number
      }
      mover_ficha_de_serie: {
        Args: { p_ficha_id: string; p_nueva_serie_id: string }
        Returns: undefined
      }
      mover_jornada: {
        Args: { p_jornada_id: string; p_nueva_fecha: string }
        Returns: undefined
      }
      pagar_gasto: {
        Args: {
          p_cheque_banco?: string
          p_cheque_debito?: string
          p_cheque_numero?: string
          p_created_by?: string
          p_gasto_id: string
          p_medio: string
          p_pagado_at: string
          p_predio_id?: string
        }
        Returns: string
      }
      periodo_de_fecha: { Args: { p_fecha: string }; Returns: string }
      preview_cobro: {
        Args: {
          p_imputaciones: Json
          p_medio: string
          p_monto: number
          p_tercero_id: string
        }
        Returns: Json
      }
      preview_entrega_central: { Args: { p_arqueo_id: string }; Returns: Json }
      preview_gasto: {
        Args: { p_cat_gasto_id: string; p_total: number }
        Returns: Json
      }
      preview_pago_gasto: {
        Args: { p_gasto_id: string; p_medio: string }
        Returns: Json
      }
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
      reabrir_torneo: {
        Args: { p_motivo: string; p_torneo_id: string }
        Returns: undefined
      }
      recibir_efectivo_en_transito: {
        Args: {
          p_fecha?: string
          p_imputaciones?: Json
          p_medio?: string
          p_monto: number
          p_responsable_id?: string
          p_tercero_id: string
        }
        Returns: string
      }
      registrar_cobro: {
        Args: {
          p_cheque_banco?: string
          p_cheque_fecha_cobro?: string
          p_cheque_numero?: string
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
      registrar_cobro_sponsor: {
        Args: {
          p_created_by?: string
          p_cuota_id: string
          p_fecha?: string
          p_medio: string
          p_predio_id?: string
        }
        Returns: string
      }
      registrar_entrega_central: {
        Args: {
          p_arqueo_id: string
          p_fecha?: string
          p_responsable_id?: string
        }
        Returns: string
      }
      registrar_gasto: {
        Args: {
          p_activo_id?: string
          p_arancel: number
          p_cantidad: number
          p_cat_gasto_id: string
          p_concepto_id?: string
          p_concepto_libre?: string
          p_created_by?: string
          p_devengado_at: string
          p_jornada_id?: string
          p_predio_id?: string
          p_proveedor_id?: string
          p_torneo_id?: string
        }
        Returns: string
      }
      registrar_movimiento_fondo: {
        Args: {
          p_caja_id: string
          p_fecha?: string
          p_monto: number
          p_motivo: string
          p_responsable_id?: string
          p_tipo: string
          p_torneo_id?: string
        }
        Returns: string
      }
      registrar_venta_bar: {
        Args: {
          p_created_by?: string
          p_dia_cancha_id: string
          p_efectivo?: number
          p_mp?: number
          p_observaciones?: string
          p_tarjeta?: number
        }
        Returns: string
      }
      reponer_efectivo_transito: {
        Args: {
          p_fecha?: string
          p_gasto_id: string
          p_predio_id: string
          p_responsable_id?: string
        }
        Returns: string
      }
      reservar_numero_comprobante: {
        Args: {
          p_condicion_iva_receptor_id: number
          p_cuota_cobro_sponsor_id?: string
          p_detalle?: string
          p_emitida_por?: string
          p_fecha_emision?: string
          p_iva?: number
          p_monto: number
          p_neto?: number
          p_pago_id?: string
          p_punto_venta: number
          p_receptor_doc_nro: string
          p_receptor_doc_tipo: number
          p_receptor_domicilio?: string
          p_receptor_nombre: string
          p_tipo_comprobante: number
          p_ultimo_numero_arca?: number
        }
        Returns: {
          id: string
          numero: number
        }[]
      }
      retirar_efectivo_bar: {
        Args: {
          p_created_by?: string
          p_destino: string
          p_fecha?: string
          p_monto: number
          p_motivo?: string
          p_predio_id: string
        }
        Returns: string
      }
      saldo_bar_predio: {
        Args: { p_hasta: string; p_predio_id: string }
        Returns: number
      }
      saldo_cuenta: {
        Args: { p_codigo: string; p_hasta?: string; p_torneo_id?: string }
        Returns: number
      }
      saldo_efectivo_predio: {
        Args: { p_hasta: string; p_predio_id: string }
        Returns: number
      }
      sueldo_acordado: {
        Args: { p_fecha: string; p_socio_id: string }
        Returns: number
      }
      sueldo_vigente: {
        Args: { p_fecha: string; p_socio_id: string }
        Returns: number
      }
      sugerir_imputacion: { Args: { p_pago_id: string }; Returns: Json }
      suspender_jornada: { Args: { p_jornada_id: string }; Returns: undefined }
      trasladar_entre_cajas: {
        Args: {
          p_created_by?: string
          p_destino_id: string
          p_fecha?: string
          p_monto: number
          p_motivo?: string
          p_origen_id: string
        }
        Returns: string
      }
      usd_costo_esperado: { Args: never; Returns: number }
      validar_linea_tarifa: {
        Args: {
          p_cantidad_esperada: number
          p_es_playoff: boolean
          p_fecha_desde: number
          p_fecha_hasta: number
          p_fecha_referencia: string
          p_label: string
          p_regla: Database["public"]["Enums"]["regla_vencimiento"]
        }
        Returns: undefined
      }
      validar_saldo_caja: {
        Args: {
          p_contexto?: string
          p_cuenta: string
          p_fecha: string
          p_monto: number
          p_predio_id: string
        }
        Returns: undefined
      }
      vender_usd: {
        Args: {
          p_cantidad: number
          p_created_by?: string
          p_fecha: string
          p_medio?: string
          p_motivo?: string
          p_tc: number
        }
        Returns: string
      }
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
