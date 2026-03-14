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
      console.error('[INVOKE ERROR]', error);
      throw error;
    }
    
    if (data && data.error) {
      const extra = data.raw_text || data.details || "";
      const msg = extra ? `${data.error} | RAW_DETAILS: ${typeof extra === 'object' ? JSON.stringify(extra) : extra}` : data.error;
      throw new Error(msg);
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
}
