import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class GradingService {
  constructor(private supabase: SupabaseService) {}

  async analyzeCard(imageBase64: string, cardType: 'pokemon' | 'yugioh' | 'football', evaluationId: string) {
    const { data, error } = await this.supabase.client.functions.invoke('grading-analyzer', {
      body: {
        imageBase64,
        cardType,
        evaluationId
      }
    });

    if (error) {
      console.error('[INVOKE ERROR FULL OBJECT]', error);
      
      // Intentar extraer el mensaje de error específico de Supabase FunctionsHttpError
      try {
        const anyErr = error as any;
        const response = anyErr.context || anyErr.response;
        if (response && typeof response.json === 'function') {
          const body = await response.json();
          if (body && body.error) throw new Error(body.error);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Edge Function returned a non-2xx status code') throw e;
      }
      
      throw error;
    }

    return data;
  }

  async createEvaluation(cardData: any) {
    const { data, error } = await this.supabase.client
      .from('evaluations')
      .insert(cardData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getEvaluation(id: string) {
    const { data, error } = await this.supabase.client
      .from('evaluations')
      .select('*, cards(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async deleteEvaluation(id: string) {
    const { error } = await this.supabase.client
      .from('evaluations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
